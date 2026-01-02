"""
Fixed-Role Self-Play Training Loop
===================================

Implements a fixed-role self-play training system for RL agents.
- AgentP0 ALWAYS plays as player 0
- AgentP1 ALWAYS plays as player 1
- Agents never swap roles
- No weight merging between agents
- Milestone checkpoints at 100, 1000, 10000, 100000 episodes

Draw Detection:
- Draws are explicitly recognized as terminal states
- Draw conditions: max turns (1000), repeated state (10x), no progress (100 turns)
"""

import os
import sys
import json
import yaml
import random
import numpy as np
import torch
from datetime import datetime
from typing import Dict, List, Tuple, Optional
from collections import deque
from pathlib import Path

try:
    from tqdm import tqdm
    TQDM_AVAILABLE = True
except ImportError:
    TQDM_AVAILABLE = False
    print("Note: Install tqdm for progress bar (pip install tqdm)")

try:
    import matplotlib
    matplotlib.use('Agg')  # Non-interactive backend for saving to file
    import matplotlib.pyplot as plt
    from matplotlib.gridspec import GridSpec
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("Note: Install matplotlib for training graphs (pip install matplotlib)")

from .env import NovusXEnv, GameOutcome, DrawReason
from .agent import PPOAgent, Transition, create_agent


# Milestone episodes for checkpointing
CHECKPOINT_MILESTONES = [100, 1000, 10000, 100000]


def set_seed(seed: int):
    """Set random seeds for reproducibility."""
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def load_config(config_path: str) -> Dict:
    """Load configuration from YAML file."""
    with open(config_path, 'r') as f:
        return yaml.safe_load(f)


class FixedRoleSelfPlayTrainer:
    """
    Fixed-role self-play training system.
    
    Key Design:
    - AgentP0 ALWAYS plays as player 0 (goes first)
    - AgentP1 ALWAYS plays as player 1 (goes second)
    - Identical neural network architectures
    - Separate model weights (never merged)
    - Separate optimizers
    - Separate replay buffers
    
    Checkpoints saved at milestones: 100, 1,000, 10,000, 100,000 episodes
    """
    
    def __init__(self, config: Dict, device: str = "cpu"):
        """
        Initialize the fixed-role self-play trainer.
        
        Args:
            config: Configuration dictionary
            device: Device to use for training
        """
        self.config = config
        self.device = device
        
        # Create environment
        self.env = NovusXEnv(config.get("env", {}))
        self.env.rewards = config.get("rewards", self.env.rewards)
        
        # =========================================================
        # Enable training mode for draw-type-specific rewards
        # During training, different draw types receive different penalties:
        # - no_progress: 0.0 (neutral)
        # - repetition: -0.2 (discourage state repetition)
        # - max_turns: -0.3 (encourage decisive play)
        # =========================================================
        self.env.set_training_mode(training=True)
        
        # Get observation and action sizes
        observation_size = self.env.observation_size
        action_size = self.env.action_size
        
        # =========================================================
        # Create two fixed-role agents with SEPARATE weights/optimizers
        # AgentP0: Always plays as player 0
        # AgentP1: Always plays as player 1
        # =========================================================
        self.agent_p0 = create_agent(
            observation_size, action_size, config, device, "agent_p0"
        )
        self.agent_p1 = create_agent(
            observation_size, action_size, config, device, "agent_p1"
        )
        
        # Training settings
        training_config = config.get("training", {})
        self.total_episodes = training_config.get("total_episodes", 100000)
        self.log_interval = training_config.get("log_interval", 100)
        
        # Self-play settings (no weight copying in fixed-role mode)
        self_play_config = config.get("self_play", {})
        self.elo_k = self_play_config.get("elo_update_k", 32)
        self.win_rate_window = self_play_config.get("win_rate_window", 100)
        
        # Paths
        paths_config = config.get("paths", {})
        self.checkpoint_dir = Path(paths_config.get("checkpoint_dir", "rl/checkpoints"))
        self.log_dir = Path(paths_config.get("log_dir", "rl/logs"))
        
        # Create directories
        self.checkpoint_dir.mkdir(parents=True, exist_ok=True)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # =========================================================
        # Statistics tracking (separate for each agent)
        # =========================================================
        self.episode_rewards_p0 = deque(maxlen=self.win_rate_window)
        self.episode_rewards_p1 = deque(maxlen=self.win_rate_window)
        self.episode_lengths = deque(maxlen=self.win_rate_window)
        
        # Win tracking: 1.0 = P0 wins, 0.0 = P1 wins, 0.5 = draw
        self.win_history = deque(maxlen=self.win_rate_window)
        
        # Cumulative win counts for metadata
        self.total_wins_p0 = 0
        self.total_wins_p1 = 0
        self.total_draws = 0
        
        # Draw reason tracking for analysis
        self.draw_reasons: Dict[str, int] = {
            "MAX_TURNS": 0,
            "REPEATED_STATE": 0,
            "NO_PROGRESS": 0,
        }
        
        self.total_steps = 0
        self.episode_count = 0
        
        # Track which milestones have been saved
        self.saved_milestones = set()
        
        # Logging
        self.training_log = []
    
    def run_episode(self) -> Tuple[float, float, int, Optional[int], Dict]:
        """
        Run a single self-play episode with fixed roles.
        
        AgentP0 ALWAYS plays as player 0 (acts first)
        AgentP1 ALWAYS plays as player 1 (acts second)
        
        Uses temperature-based exploration during training:
        - Early turns (<=10): Higher temperature for exploration
        - Later turns (>10): Lower temperature for exploitation
        
        Returns:
            reward_p0: Total reward for AgentP0
            reward_p1: Total reward for AgentP1
            episode_length: Number of steps in the episode
            winner: Player ID of winner (0 or 1) or None for draw
            info: Final step info dict with game outcome details
        """
        obs = self.env.reset()
        
        # Separate transition buffers for each agent (never mixed)
        transitions_p0: List[Transition] = []
        transitions_p1: List[Transition] = []
        
        total_reward_p0 = 0.0
        total_reward_p1 = 0.0
        episode_length = 0
        done = False
        info = {}
        
        # Track turn number for temperature-based exploration
        # A "turn" is one action by each player (2 steps = 1 turn)
        turn_number = 1
        
        while not done:
            # Get current player from game engine (enforces turn order)
            current_player = self.env.state.current_player
            
            # Select the correct agent based on player ID (FIXED ROLES)
            # AgentP0 always controls player 0
            # AgentP1 always controls player 1
            if current_player == 0:
                agent = self.agent_p0
            else:
                agent = self.agent_p1
            
            # Get observation from current player's perspective
            observation = self.env._get_observation(current_player)
            action_mask = self.env.get_valid_actions_mask(current_player)
            
            # ─────────────────────────────────────────────────────────────
            # Select action with temperature-based exploration
            # - turn_number: Used for temperature scheduling
            # - training=True: Enables temperature exploration
            # ─────────────────────────────────────────────────────────────
            action, log_prob, value = agent.select_action(
                observation,
                action_mask,
                deterministic=False,
                turn_number=turn_number,
                training=True
            )
            
            # Take step in environment
            next_obs, reward, done, info = self.env.step(action, current_player)
            
            # Get next observation from current player's perspective
            next_observation = self.env._get_observation(current_player)
            
            # Create transition for this agent
            transition = Transition(
                observation=observation,
                action=action,
                reward=reward,
                next_observation=next_observation,
                done=done,
                log_prob=log_prob,
                value=value,
                action_mask=action_mask
            )
            
            # Store transition in the correct agent's buffer (NEVER MIXED)
            if current_player == 0:
                transitions_p0.append(transition)
                total_reward_p0 += reward
            else:
                transitions_p1.append(transition)
                total_reward_p1 += reward
                # Increment turn number after P1's action (completes one full turn)
                turn_number += 1
            
            episode_length += 1
            self.total_steps += 1
        
        # Add transitions to each agent's separate replay buffer
        for t in transitions_p0:
            self.agent_p0.store_transition(t)
        for t in transitions_p1:
            self.agent_p1.store_transition(t)
        
        # Determine winner from game info (None for draws)
        winner = info.get("winner")
        
        return total_reward_p0, total_reward_p1, episode_length, winner, info
    
    def train_episode(self) -> Dict:
        """
        Run an episode and train both agents with their own data.
        
        Each agent is trained ONLY on its own transitions.
        Weights are NEVER merged between agents.
        Draws are explicitly recognized as terminal states.
        
        Returns:
            Dictionary of episode statistics
        """
        # Run episode with fixed roles
        reward_p0, reward_p1, length, winner, info = self.run_episode()
        self.episode_count += 1
        
        # Record statistics
        self.episode_rewards_p0.append(reward_p0)
        self.episode_rewards_p1.append(reward_p1)
        self.episode_lengths.append(length)
        
        # =========================================================
        # Record win/draw outcome and update cumulative counts
        # Draws are explicitly tracked as terminal states
        # =========================================================
        is_draw = info.get("is_draw", False)
        draw_reason = info.get("draw_reason")
        
        if winner == 0:
            self.win_history.append(1.0)  # P0 wins
            self.total_wins_p0 += 1
            result_p0, result_p1 = 1.0, 0.0
        elif winner == 1:
            self.win_history.append(0.0)  # P1 wins
            self.total_wins_p1 += 1
            result_p0, result_p1 = 0.0, 1.0
        else:
            # Explicit DRAW handling
            self.win_history.append(0.5)  # Draw
            self.total_draws += 1
            result_p0, result_p1 = 0.5, 0.5
            
            # Track draw reason for analysis
            # Also track the draw reward applied for debugging
            if draw_reason and draw_reason in self.draw_reasons:
                self.draw_reasons[draw_reason] += 1
            
            # Log draw reward for debugging (only occasionally to avoid spam)
            draw_reward = info.get("draw_reward", 0.0)
            if self.episode_count % 100 == 0:
                print(f"  Draw type: {draw_reason}, reward: {draw_reward:.2f}")
        
        # Update ELO ratings (separate tracking for each agent)
        elo_p0, elo_p1 = self.agent_p0.elo_rating, self.agent_p1.elo_rating
        self.agent_p0.update_elo(elo_p1, result_p0, self.elo_k)
        self.agent_p1.update_elo(elo_p0, result_p1, self.elo_k)
        
        # Train each agent SEPARATELY with their own transitions
        # (each agent has its own optimizer and buffer)
        stats_p0 = self.agent_p0.update(last_value=0.0)
        stats_p1 = self.agent_p1.update(last_value=0.0)
        
        return {
            "episode": self.episode_count,
            "reward_p0": reward_p0,
            "reward_p1": reward_p1,
            "length": length,
            "winner": winner,
            "is_draw": is_draw,
            "draw_reason": draw_reason,
            "elo_p0": self.agent_p0.elo_rating,
            "elo_p1": self.agent_p1.elo_rating,
            "stats_p0": stats_p0,
            "stats_p1": stats_p1,
        }
    
    def should_checkpoint(self, episode: int) -> bool:
        """
        Check if we should save a milestone checkpoint at this episode.
        
        Milestones: 100, 1000, 10000, 100000
        """
        return episode in CHECKPOINT_MILESTONES and episode not in self.saved_milestones
    
    def save_milestone_checkpoint(self, episode: int):
        """
        Save checkpoint at a milestone episode.
        
        Creates directory structure:
        checkpoints/
        ├── iter_100/
        │   ├── agent_p0.pt
        │   ├── agent_p1.pt
        │   └── metadata.json
        ├── iter_1000/
        │   └── ...
        """
        # Create milestone directory
        milestone_dir = self.checkpoint_dir / f"iter_{episode}"
        milestone_dir.mkdir(parents=True, exist_ok=True)
        
        # Set models to eval mode for checkpoint saving
        self.agent_p0.actor_critic.eval()
        self.agent_p1.actor_critic.eval()
        
        # Save AgentP0
        path_p0 = milestone_dir / "agent_p0.pt"
        self.agent_p0.save_checkpoint(str(path_p0), {
            "episode": episode,
            "total_steps": self.total_steps,
            "role": "player_0",
        })
        
        # Save AgentP1
        path_p1 = milestone_dir / "agent_p1.pt"
        self.agent_p1.save_checkpoint(str(path_p1), {
            "episode": episode,
            "total_steps": self.total_steps,
            "role": "player_1",
        })
        
        # Set models back to train mode
        self.agent_p0.actor_critic.train()
        self.agent_p1.actor_critic.train()
        
        # Calculate win rates
        total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
        win_rate_p0 = self.total_wins_p0 / total_games if total_games > 0 else 0.0
        win_rate_p1 = self.total_wins_p1 / total_games if total_games > 0 else 0.0
        draw_rate = self.total_draws / total_games if total_games > 0 else 0.0
        
        # Save metadata JSON (includes draw statistics)
        metadata = {
            "milestone": episode,
            "total_episodes": self.episode_count,
            "total_steps": self.total_steps,
            "win_rate_agent_p0": win_rate_p0,
            "win_rate_agent_p1": win_rate_p1,
            "draw_rate": draw_rate,
            "total_wins_p0": self.total_wins_p0,
            "total_wins_p1": self.total_wins_p1,
            "total_draws": self.total_draws,
            "draw_reasons": self.draw_reasons,  # Breakdown by reason
            "average_game_length": float(np.mean(self.episode_lengths)) if self.episode_lengths else 0,
            "elo_agent_p0": self.agent_p0.elo_rating,
            "elo_agent_p1": self.agent_p1.elo_rating,
            "timestamp": datetime.now().isoformat(),
            "device": self.device,
        }
        
        metadata_path = milestone_dir / "metadata.json"
        with open(metadata_path, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Mark milestone as saved
        self.saved_milestones.add(episode)
        
        print(f"\n{'='*60}")
        print(f"  MILESTONE CHECKPOINT: Episode {episode}")
        print(f"  Saved to: {milestone_dir}")
        print(f"  P0 Win Rate: {win_rate_p0:.1%} | P1 Win Rate: {win_rate_p1:.1%}")
        print(f"{'='*60}\n")
    
    def log_progress(self, episode_stats: Dict):
        """
        Log training progress every 100 episodes.
        
        Prints:
        - Episode number
        - Rolling win rates for both agents
        - Average reward per agent
        - Draw statistics
        """
        if self.episode_count % self.log_interval == 0:
            # Calculate rolling statistics
            rolling_win_rate_p0 = np.mean(self.win_history) if self.win_history else 0.5
            rolling_win_rate_p1 = 1.0 - rolling_win_rate_p0 if self.win_history else 0.5
            avg_length = np.mean(self.episode_lengths) if self.episode_lengths else 0
            avg_reward_p0 = np.mean(self.episode_rewards_p0) if self.episode_rewards_p0 else 0
            avg_reward_p1 = np.mean(self.episode_rewards_p1) if self.episode_rewards_p1 else 0
            
            # Calculate draw rate from recent history
            total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
            draw_rate = self.total_draws / total_games if total_games > 0 else 0.0
            
            # Store log entry
            log_entry = {
                "episode": self.episode_count,
                "total_steps": self.total_steps,
                "rolling_win_rate_p0": float(rolling_win_rate_p0),
                "rolling_win_rate_p1": float(rolling_win_rate_p1),
                "draw_rate": float(draw_rate),
                "avg_length": float(avg_length),
                "avg_reward_p0": float(avg_reward_p0),
                "avg_reward_p1": float(avg_reward_p1),
                "elo_p0": self.agent_p0.elo_rating,
                "elo_p1": self.agent_p1.elo_rating,
                "draw_reasons": dict(self.draw_reasons),
                "timestamp": datetime.now().isoformat(),
            }
            self.training_log.append(log_entry)
            
            # Print progress (including draw rate)
            print(f"Episode {self.episode_count:6d} | "
                  f"P0 Win: {rolling_win_rate_p0:.1%} | "
                  f"P1 Win: {rolling_win_rate_p1:.1%} | "
                  f"Draws: {draw_rate:.1%} | "
                  f"Len: {avg_length:5.1f} | "
                  f"Rew P0: {avg_reward_p0:6.2f} | "
                  f"Rew P1: {avg_reward_p1:6.2f}")
    
    def generate_training_graphs(self, save_dir: Optional[Path] = None, title_suffix: str = ""):
        """
        Generate comprehensive training visualization graphs.
        
        Creates multiple graphs showing:
        1. Win rates over time (P0, P1, Draws)
        2. ELO ratings progression
        3. Episode length trends
        4. Reward progression
        5. Draw reason breakdown (pie chart)
        6. Cumulative outcomes (stacked area)
        
        Args:
            save_dir: Directory to save graphs. Defaults to log_dir.
            title_suffix: Optional suffix for graph titles (e.g., "- Interrupted")
        """
        if not MATPLOTLIB_AVAILABLE:
            print("Warning: matplotlib not available, skipping graph generation")
            return
        
        if not self.training_log:
            print("Warning: No training log data, skipping graph generation")
            return
        
        save_dir = save_dir or self.log_dir
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # Extract data from training log
        episodes = [entry["episode"] for entry in self.training_log]
        win_rate_p0 = [entry["rolling_win_rate_p0"] for entry in self.training_log]
        win_rate_p1 = [entry["rolling_win_rate_p1"] for entry in self.training_log]
        draw_rates = [entry["draw_rate"] for entry in self.training_log]
        avg_lengths = [entry["avg_length"] for entry in self.training_log]
        avg_reward_p0 = [entry["avg_reward_p0"] for entry in self.training_log]
        avg_reward_p1 = [entry["avg_reward_p1"] for entry in self.training_log]
        elo_p0 = [entry["elo_p0"] for entry in self.training_log]
        elo_p1 = [entry["elo_p1"] for entry in self.training_log]
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # ═══════════════════════════════════════════════════════════════════
        # Figure 1: Comprehensive Dashboard (2x3 grid)
        # ═══════════════════════════════════════════════════════════════════
        fig = plt.figure(figsize=(16, 12))
        fig.suptitle(f'NovusX RL Training Dashboard - Episode {self.episode_count}{title_suffix}', 
                     fontsize=14, fontweight='bold')
        
        gs = GridSpec(2, 3, figure=fig, hspace=0.3, wspace=0.3)
        
        # --- Plot 1: Win Rates Over Time ---
        ax1 = fig.add_subplot(gs[0, 0])
        ax1.plot(episodes, win_rate_p0, label='P0 Win Rate', color='#2563eb', linewidth=1.5)
        ax1.plot(episodes, win_rate_p1, label='P1 Win Rate', color='#dc2626', linewidth=1.5)
        ax1.plot(episodes, draw_rates, label='Draw Rate', color='#6b7280', linewidth=1.5, linestyle='--')
        ax1.set_xlabel('Episode')
        ax1.set_ylabel('Rate')
        ax1.set_title('Win/Draw Rates Over Time')
        ax1.legend(loc='upper right', fontsize=8)
        ax1.grid(True, alpha=0.3)
        ax1.set_ylim(0, 1)
        ax1.axhline(y=0.5, color='gray', linestyle=':', alpha=0.5)
        
        # --- Plot 2: ELO Ratings ---
        ax2 = fig.add_subplot(gs[0, 1])
        ax2.plot(episodes, elo_p0, label='P0 ELO', color='#2563eb', linewidth=1.5)
        ax2.plot(episodes, elo_p1, label='P1 ELO', color='#dc2626', linewidth=1.5)
        ax2.set_xlabel('Episode')
        ax2.set_ylabel('ELO Rating')
        ax2.set_title('ELO Ratings Progression')
        ax2.legend(loc='upper left', fontsize=8)
        ax2.grid(True, alpha=0.3)
        ax2.axhline(y=1000, color='gray', linestyle=':', alpha=0.5, label='Starting ELO')
        
        # --- Plot 3: Episode Length ---
        ax3 = fig.add_subplot(gs[0, 2])
        ax3.plot(episodes, avg_lengths, color='#059669', linewidth=1.5)
        ax3.fill_between(episodes, avg_lengths, alpha=0.3, color='#059669')
        ax3.set_xlabel('Episode')
        ax3.set_ylabel('Average Length')
        ax3.set_title('Episode Length Trend')
        ax3.grid(True, alpha=0.3)
        
        # --- Plot 4: Rewards ---
        ax4 = fig.add_subplot(gs[1, 0])
        ax4.plot(episodes, avg_reward_p0, label='P0 Avg Reward', color='#2563eb', linewidth=1.5)
        ax4.plot(episodes, avg_reward_p1, label='P1 Avg Reward', color='#dc2626', linewidth=1.5)
        ax4.set_xlabel('Episode')
        ax4.set_ylabel('Average Reward')
        ax4.set_title('Reward Progression')
        ax4.legend(loc='upper left', fontsize=8)
        ax4.grid(True, alpha=0.3)
        ax4.axhline(y=0, color='gray', linestyle=':', alpha=0.5)
        
        # --- Plot 5: Draw Reasons Pie Chart ---
        ax5 = fig.add_subplot(gs[1, 1])
        draw_counts = [
            self.draw_reasons.get("MAX_TURNS", 0),
            self.draw_reasons.get("REPEATED_STATE", 0),
            self.draw_reasons.get("NO_PROGRESS", 0),
        ]
        draw_labels = ['Max Turns', 'Repeated State', 'No Progress']
        colors = ['#f59e0b', '#8b5cf6', '#ef4444']
        
        # Filter out zero values
        non_zero = [(c, l, col) for c, l, col in zip(draw_counts, draw_labels, colors) if c > 0]
        if non_zero:
            counts, labels, cols = zip(*non_zero)
            ax5.pie(counts, labels=labels, colors=cols, autopct='%1.1f%%', startangle=90)
        else:
            ax5.text(0.5, 0.5, 'No Draws', ha='center', va='center', fontsize=12)
            ax5.set_xlim(0, 1)
            ax5.set_ylim(0, 1)
        ax5.set_title(f'Draw Reasons (Total: {self.total_draws})')
        
        # --- Plot 6: Cumulative Outcomes ---
        ax6 = fig.add_subplot(gs[1, 2])
        total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
        if total_games > 0:
            outcomes = [self.total_wins_p0, self.total_wins_p1, self.total_draws]
            outcome_labels = [f'P0 Wins\n({self.total_wins_p0})', 
                              f'P1 Wins\n({self.total_wins_p1})', 
                              f'Draws\n({self.total_draws})']
            bars = ax6.bar(outcome_labels, outcomes, color=['#2563eb', '#dc2626', '#6b7280'])
            ax6.set_ylabel('Count')
            ax6.set_title(f'Total Outcomes ({total_games} games)')
            
            # Add percentage labels on bars
            for bar, count in zip(bars, outcomes):
                height = bar.get_height()
                ax6.annotate(f'{count/total_games:.1%}',
                           xy=(bar.get_x() + bar.get_width() / 2, height),
                           xytext=(0, 3), textcoords="offset points",
                           ha='center', va='bottom', fontsize=10)
        else:
            ax6.text(0.5, 0.5, 'No Games', ha='center', va='center', fontsize=12)
        ax6.grid(True, alpha=0.3, axis='y')
        
        # Save dashboard
        dashboard_path = save_dir / f"training_dashboard_{timestamp}.png"
        plt.savefig(dashboard_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig)
        print(f"  📊 Dashboard saved: {dashboard_path}")
        
        # ═══════════════════════════════════════════════════════════════════
        # Figure 2: Win Rate Detail (larger, single graph)
        # ═══════════════════════════════════════════════════════════════════
        fig2, ax = plt.subplots(figsize=(12, 6))
        ax.plot(episodes, win_rate_p0, label='P0 Win Rate', color='#2563eb', linewidth=2)
        ax.plot(episodes, win_rate_p1, label='P1 Win Rate', color='#dc2626', linewidth=2)
        ax.plot(episodes, draw_rates, label='Draw Rate', color='#6b7280', linewidth=2, linestyle='--')
        
        # Add smoothed trend lines if enough data
        if len(episodes) > 20:
            window = min(50, len(episodes) // 10)
            smooth_p0 = np.convolve(win_rate_p0, np.ones(window)/window, mode='valid')
            smooth_p1 = np.convolve(win_rate_p1, np.ones(window)/window, mode='valid')
            smooth_episodes = episodes[window-1:]
            ax.plot(smooth_episodes, smooth_p0, color='#1e40af', linewidth=3, alpha=0.5, label='P0 Trend')
            ax.plot(smooth_episodes, smooth_p1, color='#991b1b', linewidth=3, alpha=0.5, label='P1 Trend')
        
        ax.set_xlabel('Episode', fontsize=12)
        ax.set_ylabel('Win Rate', fontsize=12)
        ax.set_title(f'Win Rate Analysis - Episode {self.episode_count}{title_suffix}', fontsize=14, fontweight='bold')
        ax.legend(loc='upper right')
        ax.grid(True, alpha=0.3)
        ax.set_ylim(0, 1)
        ax.axhline(y=0.5, color='gray', linestyle=':', alpha=0.5, label='50% baseline')
        
        # Add final stats annotation
        final_p0 = win_rate_p0[-1] if win_rate_p0 else 0
        final_p1 = win_rate_p1[-1] if win_rate_p1 else 0
        final_draw = draw_rates[-1] if draw_rates else 0
        stats_text = f'Final: P0={final_p0:.1%}, P1={final_p1:.1%}, Draw={final_draw:.1%}'
        ax.annotate(stats_text, xy=(0.02, 0.98), xycoords='axes fraction',
                   fontsize=10, verticalalignment='top',
                   bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        winrate_path = save_dir / f"win_rates_{timestamp}.png"
        plt.savefig(winrate_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig2)
        print(f"  📊 Win rates saved: {winrate_path}")
        
        # ═══════════════════════════════════════════════════════════════════
        # Figure 3: ELO Rating Detail
        # ═══════════════════════════════════════════════════════════════════
        fig3, ax = plt.subplots(figsize=(12, 6))
        ax.plot(episodes, elo_p0, label='P0 ELO', color='#2563eb', linewidth=2)
        ax.plot(episodes, elo_p1, label='P1 ELO', color='#dc2626', linewidth=2)
        ax.fill_between(episodes, elo_p0, elo_p1, alpha=0.2, color='#6b7280')
        
        ax.set_xlabel('Episode', fontsize=12)
        ax.set_ylabel('ELO Rating', fontsize=12)
        ax.set_title(f'ELO Rating Progression - Episode {self.episode_count}{title_suffix}', fontsize=14, fontweight='bold')
        ax.legend(loc='upper left')
        ax.grid(True, alpha=0.3)
        ax.axhline(y=1000, color='gray', linestyle=':', alpha=0.5)
        
        # Add final ELO annotation
        final_elo_p0 = elo_p0[-1] if elo_p0 else 1000
        final_elo_p1 = elo_p1[-1] if elo_p1 else 1000
        stats_text = f'Final ELO: P0={final_elo_p0:.0f}, P1={final_elo_p1:.0f}, Δ={abs(final_elo_p0-final_elo_p1):.0f}'
        ax.annotate(stats_text, xy=(0.02, 0.98), xycoords='axes fraction',
                   fontsize=10, verticalalignment='top',
                   bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        elo_path = save_dir / f"elo_ratings_{timestamp}.png"
        plt.savefig(elo_path, dpi=150, bbox_inches='tight', facecolor='white')
        plt.close(fig3)
        print(f"  📊 ELO ratings saved: {elo_path}")
        
        # ═══════════════════════════════════════════════════════════════════
        # Save training log as JSON for later analysis
        # ═══════════════════════════════════════════════════════════════════
        log_path = save_dir / f"training_log_{timestamp}.json"
        with open(log_path, 'w') as f:
            json.dump({
                "final_episode": self.episode_count,
                "total_steps": self.total_steps,
                "total_wins_p0": self.total_wins_p0,
                "total_wins_p1": self.total_wins_p1,
                "total_draws": self.total_draws,
                "draw_reasons": self.draw_reasons,
                "final_elo_p0": self.agent_p0.elo_rating,
                "final_elo_p1": self.agent_p1.elo_rating,
                "log": self.training_log
            }, f, indent=2)
        print(f"  📄 Training log saved: {log_path}")
        
        print(f"\n  All graphs saved to: {save_dir}")
    
    def train(self):
        """
        Main training loop with fixed-role self-play.
        
        - AgentP0 always plays as player 0
        - AgentP1 always plays as player 1
        - Checkpoints at milestones: 100, 1000, 10000, 100000
        - No weight merging between agents
        - Automatically resumes from last episode if resuming
        """
        # Calculate starting and ending episodes
        start_episode = self.episode_count + 1
        end_episode = self.total_episodes
        remaining_episodes = end_episode - self.episode_count
        
        print("=" * 70)
        print("Fixed-Role Self-Play Training")
        print("=" * 70)
        print(f"AgentP0: Always plays as Player 0 (first)")
        print(f"AgentP1: Always plays as Player 1 (second)")
        if start_episode > 1:
            print(f"Resuming from episode: {start_episode}")
        print(f"Target episodes: {end_episode}")
        print(f"Remaining episodes: {remaining_episodes}")
        print(f"Checkpoint milestones: {CHECKPOINT_MILESTONES}")
        print(f"Already saved milestones: {sorted(self.saved_milestones) if self.saved_milestones else 'None'}")
        print(f"Device: {self.device}")
        print("=" * 70)
        
        # Create progress bar
        if TQDM_AVAILABLE:
            pbar = tqdm(
                total=remaining_episodes,
                initial=0,
                desc="Training",
                unit="ep",
                ncols=120,
                bar_format="{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}] {postfix}"
            )
        else:
            pbar = None
        
        try:
            for episode in range(start_episode, end_episode + 1):
                # Train one episode (no role swapping)
                episode_stats = self.train_episode()
                
                # Update progress bar with statistics
                if pbar is not None:
                    pbar.update(1)
                    
                    # Calculate rolling stats for display
                    win_rate_p0 = np.mean(self.win_history) if self.win_history else 0.5
                    win_rate_p1 = 1.0 - win_rate_p0
                    avg_len = np.mean(self.episode_lengths) if self.episode_lengths else 0
                    total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
                    draw_rate = self.total_draws / total_games if total_games > 0 else 0
                    
                    pbar.set_postfix({
                        'P0': f'{win_rate_p0:.0%}',
                        'P1': f'{win_rate_p1:.0%}',
                        'Draw': f'{draw_rate:.0%}',
                        'Len': f'{avg_len:.0f}',
                        'ELO': f'{self.agent_p0.elo_rating:.0f}/{self.agent_p1.elo_rating:.0f}'
                    }, refresh=True)
                
                # Log detailed progress every 100 episodes (to file/console)
                self.log_progress(episode_stats)
                
                # Check for milestone checkpoint
                if self.should_checkpoint(episode):
                    if pbar is not None:
                        pbar.write(f"\n{'='*60}")
                        pbar.write(f"  CHECKPOINT: Episode {episode}")
                        pbar.write(f"{'='*60}")
                    self.save_milestone_checkpoint(episode)
        
        except KeyboardInterrupt:
            if pbar is not None:
                pbar.write("\n[Interrupted] Saving emergency checkpoint...")
            else:
                print("\n[Interrupted] Saving emergency checkpoint...")
            
            # Save to a special interrupt directory
            interrupt_dir = self.checkpoint_dir / f"interrupted_ep{self.episode_count}"
            interrupt_dir.mkdir(parents=True, exist_ok=True)
            
            self.agent_p0.actor_critic.eval()
            self.agent_p1.actor_critic.eval()
            self.agent_p0.save_checkpoint(str(interrupt_dir / "agent_p0.pt"), {
                "episode": self.episode_count,
                "total_steps": self.total_steps,
                "role": "player_0",
            })
            self.agent_p1.save_checkpoint(str(interrupt_dir / "agent_p1.pt"), {
                "episode": self.episode_count,
                "total_steps": self.total_steps,
                "role": "player_1",
            })
            self.agent_p0.actor_critic.train()
            self.agent_p1.actor_critic.train()
            
            # Save metadata for proper resume
            total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
            metadata = {
                "checkpoint_type": "interrupted",
                "total_episodes": self.episode_count,
                "total_steps": self.total_steps,
                "total_wins_p0": self.total_wins_p0,
                "total_wins_p1": self.total_wins_p1,
                "total_draws": self.total_draws,
                "draw_reasons": dict(self.draw_reasons),
                "win_rate_agent_p0": self.total_wins_p0 / total_games if total_games > 0 else 0,
                "win_rate_agent_p1": self.total_wins_p1 / total_games if total_games > 0 else 0,
                "draw_rate": self.total_draws / total_games if total_games > 0 else 0,
                "average_game_length": float(np.mean(self.episode_lengths)) if self.episode_lengths else 0,
                "elo_agent_p0": self.agent_p0.elo_rating,
                "elo_agent_p1": self.agent_p1.elo_rating,
                "timestamp": datetime.now().isoformat(),
                "device": self.device,
            }
            metadata_path = interrupt_dir / "metadata.json"
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            if pbar is not None:
                pbar.write(f"Emergency checkpoint saved to {interrupt_dir}")
                pbar.write(f"  Episodes: {self.episode_count}, Steps: {self.total_steps}")
                pbar.write(f"  To resume: python -m rl.train_self_play")
            else:
                print(f"Emergency checkpoint saved to {interrupt_dir}")
                print(f"  Episodes: {self.episode_count}, Steps: {self.total_steps}")
                print(f"  To resume: python -m rl.train_self_play")
            
            # Generate graphs on interrupt
            if pbar is not None:
                pbar.write("\n[Interrupted] Generating training graphs...")
            else:
                print("\n[Interrupted] Generating training graphs...")
            self.generate_training_graphs(save_dir=interrupt_dir, title_suffix=" (Interrupted)")
        
        finally:
            # Close progress bar
            if pbar is not None:
                pbar.close()
        
        print("\n" + "=" * 70)
        print("Training Complete!")
        print("=" * 70)
        
        # Final statistics
        total_games = self.total_wins_p0 + self.total_wins_p1 + self.total_draws
        if total_games > 0:
            print(f"Total Games: {total_games}")
            print(f"P0 Wins: {self.total_wins_p0} ({self.total_wins_p0/total_games:.1%})")
            print(f"P1 Wins: {self.total_wins_p1} ({self.total_wins_p1/total_games:.1%})")
            print(f"Draws: {self.total_draws} ({self.total_draws/total_games:.1%})")
            print(f"\nDraw Reasons:")
            for reason, count in self.draw_reasons.items():
                if count > 0:
                    print(f"  {reason}: {count} ({count/self.total_draws:.1%} of draws)")
        
        # Generate final training graphs
        print("\nGenerating training graphs...")
        self.generate_training_graphs(title_suffix=" (Complete)")


def find_latest_checkpoint(checkpoint_dir: Path) -> Optional[Path]:
    """
    Find the latest checkpoint to resume from.
    
    Priority:
    1. Interrupted checkpoints (interrupted_ep*) - sorted by episode number
    2. Milestone checkpoints (iter_*) - sorted by iteration
    
    Returns:
        Path to the latest checkpoint directory, or None if no checkpoints found
    """
    if not checkpoint_dir.exists():
        return None
    
    # Find all interrupted checkpoints
    interrupted = []
    for d in checkpoint_dir.iterdir():
        if d.is_dir() and d.name.startswith("interrupted_ep"):
            try:
                ep_num = int(d.name.replace("interrupted_ep", ""))
                # Verify it has the required files
                if (d / "agent_p0.pt").exists() and (d / "agent_p1.pt").exists():
                    interrupted.append((ep_num, d))
            except ValueError:
                pass
    
    # Find all milestone checkpoints
    milestones = []
    for d in checkpoint_dir.iterdir():
        if d.is_dir() and d.name.startswith("iter_"):
            try:
                iter_num = int(d.name.replace("iter_", ""))
                if (d / "agent_p0.pt").exists() and (d / "agent_p1.pt").exists():
                    milestones.append((iter_num, d))
            except ValueError:
                pass
    
    # Get the latest checkpoint (highest episode/iteration number)
    latest_interrupted = max(interrupted, key=lambda x: x[0]) if interrupted else None
    latest_milestone = max(milestones, key=lambda x: x[0]) if milestones else None
    
    # Return the one with higher episode count
    if latest_interrupted and latest_milestone:
        if latest_interrupted[0] > latest_milestone[0]:
            return latest_interrupted[1]
        else:
            return latest_milestone[1]
    elif latest_interrupted:
        return latest_interrupted[1]
    elif latest_milestone:
        return latest_milestone[1]
    
    return None


def get_episode_from_checkpoint(checkpoint_dir: Path) -> int:
    """Extract episode number from checkpoint directory."""
    name = checkpoint_dir.name
    if name.startswith("interrupted_ep"):
        return int(name.replace("interrupted_ep", ""))
    elif name.startswith("iter_"):
        return int(name.replace("iter_", ""))
    return 0


def main():
    """Main entry point for fixed-role self-play training."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Fixed-Role Self-Play RL Training")
    parser.add_argument(
        "--config", 
        type=str, 
        default="rl/config.yaml",
        help="Path to configuration file"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cuda" if torch.cuda.is_available() else "cpu",
        help="Device to use (cuda/cpu)"
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=None,
        help="Random seed (overrides config)"
    )
    parser.add_argument(
        "--resume",
        type=str,
        default=None,
        help="Path to checkpoint directory to resume from (e.g., rl/checkpoints/iter_1000). Use 'auto' to find latest."
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Start fresh training, ignoring any existing checkpoints"
    )
    
    args = parser.parse_args()
    
    # Load config
    config = load_config(args.config)
    
    # Get checkpoint directory from config
    paths_config = config.get("paths", {})
    checkpoint_dir = Path(paths_config.get("checkpoint_dir", "rl/checkpoints"))
    
    # Determine resume path
    resume_dir = None
    
    if args.fresh:
        print("Starting fresh training (--fresh flag set)")
        resume_dir = None
    elif args.resume:
        if args.resume.lower() == "auto":
            # Auto-detect latest checkpoint
            resume_dir = find_latest_checkpoint(checkpoint_dir)
            if resume_dir:
                print(f"Auto-detected latest checkpoint: {resume_dir}")
            else:
                print("No existing checkpoints found, starting fresh")
        else:
            resume_dir = Path(args.resume)
            if not resume_dir.exists():
                print(f"Warning: Specified resume directory {args.resume} not found")
                resume_dir = None
    else:
        # Default behavior: auto-resume from latest checkpoint if available
        resume_dir = find_latest_checkpoint(checkpoint_dir)
        if resume_dir:
            print(f"Found existing checkpoint, auto-resuming from: {resume_dir}")
            print("(Use --fresh to start from scratch)")
        else:
            print("No existing checkpoints found, starting fresh training")
    
    # Set seed
    seed = args.seed or config.get("training", {}).get("seed", 42)
    set_seed(seed)
    print(f"Random seed: {seed}")
    
    # Create trainer with fixed roles
    trainer = FixedRoleSelfPlayTrainer(config, device=args.device)
    
    # Resume from checkpoint if we have one
    if resume_dir and resume_dir.exists():
        print(f"\n{'='*60}")
        print(f"  RESUMING FROM: {resume_dir}")
        print(f"{'='*60}")
        
        # Load AgentP0
        p0_path = resume_dir / "agent_p0.pt"
        if p0_path.exists():
            checkpoint_p0 = trainer.agent_p0.load_checkpoint(str(p0_path))
            print(f"  ✓ Loaded AgentP0 from {p0_path}")
            if "episode" in checkpoint_p0:
                print(f"    Episode in checkpoint: {checkpoint_p0['episode']}")
        
        # Load AgentP1
        p1_path = resume_dir / "agent_p1.pt"
        if p1_path.exists():
            checkpoint_p1 = trainer.agent_p1.load_checkpoint(str(p1_path))
            print(f"  ✓ Loaded AgentP1 from {p1_path}")
        
        # Try to load metadata for statistics
        metadata_path = resume_dir / "metadata.json"
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                metadata = json.load(f)
            trainer.episode_count = metadata.get("total_episodes", 0)
            trainer.total_steps = metadata.get("total_steps", 0)
            trainer.total_wins_p0 = metadata.get("total_wins_p0", 0)
            trainer.total_wins_p1 = metadata.get("total_wins_p1", 0)
            trainer.total_draws = metadata.get("total_draws", 0)
            
            # Restore draw reasons if available
            if "draw_reasons" in metadata:
                trainer.draw_reasons.update(metadata["draw_reasons"])
            
            # Mark milestones up to this point as saved
            for milestone in CHECKPOINT_MILESTONES:
                if milestone <= trainer.episode_count:
                    trainer.saved_milestones.add(milestone)
            
            print(f"  ✓ Restored statistics from metadata")
            print(f"    Episodes: {trainer.episode_count}")
            print(f"    Total steps: {trainer.total_steps}")
            print(f"    P0 wins: {trainer.total_wins_p0}, P1 wins: {trainer.total_wins_p1}, Draws: {trainer.total_draws}")
        else:
            # No metadata - extract episode from directory name
            trainer.episode_count = get_episode_from_checkpoint(resume_dir)
            print(f"  ⚠ No metadata.json found, using episode from directory name: {trainer.episode_count}")
            
            # Mark milestones up to this point as saved
            for milestone in CHECKPOINT_MILESTONES:
                if milestone <= trainer.episode_count:
                    trainer.saved_milestones.add(milestone)
        
        # Adjust total_episodes to be remaining episodes
        remaining = trainer.total_episodes - trainer.episode_count
        if remaining <= 0:
            print(f"\n  Training already completed ({trainer.episode_count} >= {trainer.total_episodes})")
            print(f"  Use --config with higher total_episodes or --fresh to restart")
            return
        
        print(f"\n  Remaining episodes: {remaining}")
        print(f"{'='*60}\n")
    
    # Train
    trainer.train()


if __name__ == "__main__":
    main()
