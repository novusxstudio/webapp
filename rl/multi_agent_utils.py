"""
Checkpoint and plotting utilities for multi-agent training.
"""

import os
import json
import glob
from typing import Dict, List, Optional, Tuple
import numpy as np

import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.figure import Figure


def find_latest_checkpoint(checkpoint_dir: str, agent_id: str) -> Optional[str]:
    """
    Find the latest checkpoint for an agent.
    
    Args:
        checkpoint_dir: Base checkpoint directory
        agent_id: Agent identifier (A-H)
    
    Returns:
        Path to latest checkpoint or None if not found
    """
    agent_dir = os.path.join(checkpoint_dir, f"agent_{agent_id}")
    if not os.path.exists(agent_dir):
        return None
    
    checkpoints = glob.glob(os.path.join(agent_dir, "checkpoint_*.pt"))
    if not checkpoints:
        return None
    
    # Sort by iteration number
    def get_iteration(path):
        basename = os.path.basename(path)
        try:
            return int(basename.replace("checkpoint_", "").replace(".pt", ""))
        except ValueError:
            return 0
    
    checkpoints.sort(key=get_iteration, reverse=True)
    return checkpoints[0]


def save_checkpoint(
    agent,  # Agent object
    checkpoint_dir: str,
    iteration: int,
    is_small: bool = False,
    is_medium: bool = False,
    is_large: bool = False
):
    """
    Save agent checkpoint.
    
    Args:
        agent: Agent to save
        checkpoint_dir: Base checkpoint directory
        iteration: Current iteration number
        is_small/medium/large: Checkpoint interval flags
    """
    agent_dir = os.path.join(checkpoint_dir, f"agent_{agent.agent_id}")
    os.makedirs(agent_dir, exist_ok=True)
    
    # Save with iteration number
    checkpoint_path = os.path.join(agent_dir, f"checkpoint_{iteration}.pt")
    agent.save_checkpoint(checkpoint_path)
    
    # Also save as "latest"
    latest_path = os.path.join(agent_dir, "checkpoint_latest.pt")
    agent.save_checkpoint(latest_path)
    
    # Keep milestone checkpoints, clean up others
    # Keep: latest, every 1000, every 10000
    checkpoints = glob.glob(os.path.join(agent_dir, "checkpoint_*.pt"))
    for cp in checkpoints:
        basename = os.path.basename(cp)
        if basename == "checkpoint_latest.pt":
            continue
        
        try:
            cp_iter = int(basename.replace("checkpoint_", "").replace(".pt", ""))
        except ValueError:
            continue
        
        # Keep milestones
        if cp_iter % 10000 == 0:
            continue
        if cp_iter % 1000 == 0 and cp_iter >= iteration - 5000:
            continue
        if cp_iter >= iteration - 500:  # Keep recent
            continue
        
        # Remove old non-milestone checkpoints
        try:
            os.remove(cp)
        except OSError:
            pass


def save_training_state(
    checkpoint_dir: str,
    iteration: int,
    agent_stats: Dict[str, dict],
    matchup_history: List[dict],
    global_stats: Dict[str, int] = None
):
    """
    Save global training state.
    
    Args:
        checkpoint_dir: Base checkpoint directory
        iteration: Current iteration
        agent_stats: Per-agent statistics
        matchup_history: History of matchups played
        global_stats: Global P0/P1 statistics
    """
    # Compute rates for global stats
    if global_stats:
        total = global_stats.get('total_games', 0)
        if total > 0:
            global_stats['p0_win_rate'] = global_stats['p0_wins'] / total
            global_stats['p0_loss_rate'] = global_stats['p0_losses'] / total
            global_stats['p0_draw_rate'] = global_stats['p0_draws'] / total
            global_stats['p1_win_rate'] = global_stats['p1_wins'] / total
            global_stats['p1_loss_rate'] = global_stats['p1_losses'] / total
            global_stats['p1_draw_rate'] = global_stats['p1_draws'] / total
    
    state = {
        'iteration': iteration,
        'agent_stats': agent_stats,
        'global_stats': global_stats or {},
        'matchup_history': matchup_history[-10000:]  # Keep last 10k
    }
    
    state_path = os.path.join(checkpoint_dir, "training_state.json")
    with open(state_path, 'w') as f:
        json.dump(state, f, indent=2)


def load_training_state(checkpoint_dir: str) -> Optional[dict]:
    """Load global training state."""
    state_path = os.path.join(checkpoint_dir, "training_state.json")
    if not os.path.exists(state_path):
        return None
    
    with open(state_path, 'r') as f:
        return json.load(f)


def compute_elo_ratings(
    agent_ids: List[str],
    matchup_history: List[dict],
    initial_elo: float = 1000.0,
    k_factor: float = 32.0
) -> Dict[str, float]:
    """
    Compute ELO ratings for all agents based on match history.
    
    Args:
        agent_ids: List of agent identifiers
        matchup_history: List of match results
        initial_elo: Starting ELO rating
        k_factor: ELO K-factor
    
    Returns:
        Dictionary mapping agent_id to ELO rating
    """
    elo_ratings = {aid: initial_elo for aid in agent_ids}
    
    for match in matchup_history:
        agent1 = match['agent1']
        agent2 = match['agent2']
        winner = match.get('winner')
        
        if agent1 not in elo_ratings or agent2 not in elo_ratings:
            continue
        
        r1 = elo_ratings[agent1]
        r2 = elo_ratings[agent2]
        
        # Expected scores
        e1 = 1 / (1 + 10 ** ((r2 - r1) / 400))
        e2 = 1 / (1 + 10 ** ((r1 - r2) / 400))
        
        # Actual scores
        if winner == 0:  # agent1 wins
            s1, s2 = 1.0, 0.0
        elif winner == 1:  # agent2 wins
            s1, s2 = 0.0, 1.0
        else:  # draw
            s1, s2 = 0.5, 0.5
        
        # Update ratings
        elo_ratings[agent1] = r1 + k_factor * (s1 - e1)
        elo_ratings[agent2] = r2 + k_factor * (s2 - e2)
    
    return elo_ratings


def plot_training_progress(
    agents: List,  # List of Agent objects
    plot_dir: str,
    iteration: int,
    matchup_history: List[dict]
):
    """
    Generate and save training progress plots.
    
    Args:
        agents: List of Agent objects
        plot_dir: Directory to save plots
        iteration: Current iteration
        matchup_history: Match history for ELO calculation
    """
    os.makedirs(plot_dir, exist_ok=True)
    
    agent_ids = [a.agent_id for a in agents]
    colors = plt.cm.tab10(np.linspace(0, 1, len(agents)))
    
    # 1. Win Rate Over Time
    fig, ax = plt.subplots(figsize=(12, 6))
    for agent, color in zip(agents, colors):
        if len(agent.iteration_history) > 0:
            ax.plot(
                agent.iteration_history, 
                agent.win_rate_history,
                label=f"Agent {agent.agent_id}",
                color=color,
                alpha=0.8
            )
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Win Rate")
    ax.set_title("Win Rate Over Training")
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))
    ax.grid(True, alpha=0.3)
    ax.set_ylim(0, 1)
    plt.tight_layout()
    fig.savefig(os.path.join(plot_dir, f"win_rate_{iteration}.png"), dpi=150)
    fig.savefig(os.path.join(plot_dir, "win_rate_latest.png"), dpi=150)
    plt.close(fig)
    
    # 2. Average Reward Over Time
    fig, ax = plt.subplots(figsize=(12, 6))
    for agent, color in zip(agents, colors):
        if len(agent.iteration_history) > 0:
            ax.plot(
                agent.iteration_history,
                agent.avg_reward_history,
                label=f"Agent {agent.agent_id}",
                color=color,
                alpha=0.8
            )
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Average Reward")
    ax.set_title("Average Reward Over Training")
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(os.path.join(plot_dir, f"avg_reward_{iteration}.png"), dpi=150)
    fig.savefig(os.path.join(plot_dir, "avg_reward_latest.png"), dpi=150)
    plt.close(fig)
    
    # 3. Episode Length Over Time
    fig, ax = plt.subplots(figsize=(12, 6))
    for agent, color in zip(agents, colors):
        if len(agent.iteration_history) > 0:
            ax.plot(
                agent.iteration_history,
                agent.avg_length_history,
                label=f"Agent {agent.agent_id}",
                color=color,
                alpha=0.8
            )
    ax.set_xlabel("Iteration")
    ax.set_ylabel("Average Episode Length")
    ax.set_title("Episode Length Over Training")
    ax.legend(loc='upper left', bbox_to_anchor=(1.02, 1))
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    fig.savefig(os.path.join(plot_dir, f"episode_length_{iteration}.png"), dpi=150)
    fig.savefig(os.path.join(plot_dir, "episode_length_latest.png"), dpi=150)
    plt.close(fig)
    
    # 4. ELO Ratings
    if len(matchup_history) > 0:
        elo_ratings = compute_elo_ratings(agent_ids, matchup_history)
        
        fig, ax = plt.subplots(figsize=(10, 6))
        sorted_agents = sorted(elo_ratings.items(), key=lambda x: x[1], reverse=True)
        names = [f"Agent {a[0]}" for a in sorted_agents]
        ratings = [a[1] for a in sorted_agents]
        
        bars = ax.barh(names, ratings, color=[colors[agent_ids.index(a[0])] for a in sorted_agents])
        ax.set_xlabel("ELO Rating")
        ax.set_title(f"ELO Ratings (Iteration {iteration})")
        ax.axvline(x=1000, color='gray', linestyle='--', alpha=0.5, label='Initial (1000)')
        
        # Add rating labels
        for bar, rating in zip(bars, ratings):
            ax.text(bar.get_width() + 5, bar.get_y() + bar.get_height()/2,
                   f'{rating:.0f}', va='center', fontsize=10)
        
        ax.set_xlim(min(800, min(ratings) - 50), max(1200, max(ratings) + 100))
        plt.tight_layout()
        fig.savefig(os.path.join(plot_dir, f"elo_ratings_{iteration}.png"), dpi=150)
        fig.savefig(os.path.join(plot_dir, "elo_ratings_latest.png"), dpi=150)
        plt.close(fig)
    
    # 5. Matchup Matrix (wins)
    if len(matchup_history) > 100:
        # Build win matrix
        win_matrix = np.zeros((len(agent_ids), len(agent_ids)))
        game_matrix = np.zeros((len(agent_ids), len(agent_ids)))
        
        for match in matchup_history:
            a1, a2 = match['agent1'], match['agent2']
            winner = match.get('winner')
            
            if a1 not in agent_ids or a2 not in agent_ids:
                continue
            
            i1 = agent_ids.index(a1)
            i2 = agent_ids.index(a2)
            
            game_matrix[i1, i2] += 1
            game_matrix[i2, i1] += 1
            
            if winner == 0:
                win_matrix[i1, i2] += 1
            elif winner == 1:
                win_matrix[i2, i1] += 1
            else:
                win_matrix[i1, i2] += 0.5
                win_matrix[i2, i1] += 0.5
        
        # Compute win rates
        with np.errstate(divide='ignore', invalid='ignore'):
            winrate_matrix = np.where(game_matrix > 0, win_matrix / game_matrix, 0.5)
        
        fig, ax = plt.subplots(figsize=(10, 8))
        im = ax.imshow(winrate_matrix, cmap='RdYlGn', vmin=0, vmax=1)
        
        ax.set_xticks(range(len(agent_ids)))
        ax.set_yticks(range(len(agent_ids)))
        ax.set_xticklabels([f"vs {a}" for a in agent_ids])
        ax.set_yticklabels([f"Agent {a}" for a in agent_ids])
        
        # Add text annotations
        for i in range(len(agent_ids)):
            for j in range(len(agent_ids)):
                if game_matrix[i, j] > 0:
                    text = f'{winrate_matrix[i, j]:.2f}\n({int(game_matrix[i, j])})'
                    ax.text(j, i, text, ha='center', va='center', fontsize=8)
        
        plt.colorbar(im, label='Win Rate')
        ax.set_title(f"Head-to-Head Win Rates (Iteration {iteration})")
        plt.tight_layout()
        fig.savefig(os.path.join(plot_dir, f"matchup_matrix_{iteration}.png"), dpi=150)
        fig.savefig(os.path.join(plot_dir, "matchup_matrix_latest.png"), dpi=150)
        plt.close(fig)
    
    # 6. Summary Statistics Bar Chart
    fig, axes = plt.subplots(1, 3, figsize=(15, 5))
    
    # Wins
    wins = [a.stats.wins for a in agents]
    axes[0].bar([f"Agent {a.agent_id}" for a in agents], wins, color=colors)
    axes[0].set_ylabel("Total Wins")
    axes[0].set_title("Total Wins")
    axes[0].tick_params(axis='x', rotation=45)
    
    # Win Rate
    win_rates = [a.stats.win_rate for a in agents]
    axes[1].bar([f"Agent {a.agent_id}" for a in agents], win_rates, color=colors)
    axes[1].set_ylabel("Win Rate")
    axes[1].set_title("Current Win Rate")
    axes[1].set_ylim(0, 1)
    axes[1].tick_params(axis='x', rotation=45)
    
    # Games Played
    games = [a.stats.total_episodes for a in agents]
    axes[2].bar([f"Agent {a.agent_id}" for a in agents], games, color=colors)
    axes[2].set_ylabel("Games Played")
    axes[2].set_title("Total Games")
    axes[2].tick_params(axis='x', rotation=45)
    
    plt.tight_layout()
    fig.savefig(os.path.join(plot_dir, f"summary_stats_{iteration}.png"), dpi=150)
    fig.savefig(os.path.join(plot_dir, "summary_stats_latest.png"), dpi=150)
    plt.close(fig)
    
    print(f"[Plots] Saved training progress plots to {plot_dir}")


def print_training_summary(
    agents: List,  # List of Agent objects
    iteration: int,
    matchup_history: List[dict]
):
    """Print training summary to console."""
    print("\n" + "=" * 60)
    print(f"Training Summary - Iteration {iteration}")
    print("=" * 60)
    
    # Agent stats
    print("\nAgent Statistics:")
    print("-" * 60)
    print(f"{'Agent':<10} {'Wins':<8} {'Losses':<8} {'Draws':<8} {'Win Rate':<10} {'Avg Reward':<12}")
    print("-" * 60)
    
    for agent in sorted(agents, key=lambda a: a.stats.win_rate, reverse=True):
        s = agent.stats
        print(f"Agent {agent.agent_id:<4} {s.wins:<8} {s.losses:<8} {s.draws:<8} "
              f"{s.win_rate:.3f}     {s.avg_reward:+.3f}")
    
    # ELO ratings
    if len(matchup_history) > 0:
        agent_ids = [a.agent_id for a in agents]
        elo_ratings = compute_elo_ratings(agent_ids, matchup_history)
        
        print("\nELO Ratings:")
        print("-" * 40)
        for aid, elo in sorted(elo_ratings.items(), key=lambda x: x[1], reverse=True):
            print(f"Agent {aid}: {elo:.0f}")
    
    print("=" * 60 + "\n")
