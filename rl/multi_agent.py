"""
Multi-agent class with policy/value networks for self-play training.
Each agent has independent weights and optimizer.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical
import numpy as np
from typing import Dict, Tuple, Optional, List
from dataclasses import dataclass

from multi_agent_config import (
    MultiAgentConfig, 
    GRID_SIZE, 
    NUM_UNIT_TYPES,
    ACTION_SPACE_SIZE,
    OBS_CHANNELS,
    GLOBAL_FEATURES
)


class ResidualBlock(nn.Module):
    """Residual block for the policy/value network."""
    
    def __init__(self, channels: int):
        super().__init__()
        self.conv1 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn1 = nn.BatchNorm2d(channels)
        self.conv2 = nn.Conv2d(channels, channels, kernel_size=3, padding=1)
        self.bn2 = nn.BatchNorm2d(channels)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        x = F.relu(self.bn1(self.conv1(x)))
        x = self.bn2(self.conv2(x))
        x = F.relu(x + residual)
        return x


class PolicyValueNetwork(nn.Module):
    """
    Combined policy and value network.
    Takes board state and global features as input.
    Outputs action logits and state value.
    """
    
    def __init__(self, config: MultiAgentConfig):
        super().__init__()
        self.config = config
        
        # Convolutional backbone for board state
        self.conv_input = nn.Conv2d(OBS_CHANNELS, config.hidden_dim, kernel_size=3, padding=1)
        self.bn_input = nn.BatchNorm2d(config.hidden_dim)
        
        # Residual blocks
        self.res_blocks = nn.ModuleList([
            ResidualBlock(config.hidden_dim) 
            for _ in range(config.num_hidden_layers)
        ])
        
        # Global feature processor
        self.global_fc = nn.Sequential(
            nn.Linear(GLOBAL_FEATURES, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.ReLU()
        )
        
        # Flatten conv output: hidden_dim * 5 * 5 = hidden_dim * 25
        conv_output_size = config.hidden_dim * GRID_SIZE * GRID_SIZE
        combined_size = conv_output_size + config.hidden_dim
        
        # Policy head
        self.policy_fc = nn.Sequential(
            nn.Linear(combined_size, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, ACTION_SPACE_SIZE)
        )
        
        # Value head
        self.value_fc = nn.Sequential(
            nn.Linear(combined_size, config.hidden_dim),
            nn.ReLU(),
            nn.Linear(config.hidden_dim, config.hidden_dim // 2),
            nn.ReLU(),
            nn.Linear(config.hidden_dim // 2, 1)
        )
        
    def forward(
        self, 
        board_state: torch.Tensor,  # (batch, channels, 5, 5)
        global_features: torch.Tensor  # (batch, global_features)
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass.
        
        Returns:
            policy_logits: (batch, action_space_size)
            value: (batch, 1)
        """
        # Process board state
        x = F.relu(self.bn_input(self.conv_input(board_state)))
        for block in self.res_blocks:
            x = block(x)
        x = x.view(x.size(0), -1)  # Flatten
        
        # Process global features
        g = self.global_fc(global_features)
        
        # Combine
        combined = torch.cat([x, g], dim=1)
        
        # Policy and value outputs
        policy_logits = self.policy_fc(combined)
        value = self.value_fc(combined)
        
        return policy_logits, value
    
    def get_action_and_value(
        self,
        board_state: torch.Tensor,
        global_features: torch.Tensor,
        action_mask: torch.Tensor,
        action: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Get action, log probability, entropy, and value.
        
        Args:
            board_state: (batch, channels, 5, 5)
            global_features: (batch, global_features)
            action_mask: (batch, action_space_size) - 1 for valid, 0 for invalid
            action: Optional pre-selected action
            
        Returns:
            action: Selected action
            log_prob: Log probability of action
            entropy: Policy entropy
            value: State value
        """
        policy_logits, value = self(board_state, global_features)
        
        # Mask invalid actions with -inf to ensure they are NEVER selected
        # This guarantees the agent only samples from legal actions
        masked_logits = policy_logits.clone()
        masked_logits[action_mask == 0] = float('-inf')
        
        # Create distribution from masked logits
        # softmax(-inf) = 0, so illegal actions have zero probability
        probs = F.softmax(masked_logits, dim=-1)
        
        # Clamp to avoid numerical issues (NaN from log(0))
        probs = probs.clamp(min=1e-10)
        
        dist = Categorical(probs)
        
        if action is None:
            action = dist.sample()
        
        log_prob = dist.log_prob(action)
        entropy = dist.entropy()
        
        return action, log_prob, entropy, value.squeeze(-1)


@dataclass
class AgentStats:
    """Statistics for a single agent."""
    wins: int = 0
    losses: int = 0
    draws: int = 0
    total_episodes: int = 0
    total_reward: float = 0.0
    total_episode_length: int = 0
    
    # Per-opponent stats
    wins_vs: Dict[str, int] = None
    losses_vs: Dict[str, int] = None
    draws_vs: Dict[str, int] = None
    
    # P0/P1 position stats
    games_as_p0: int = 0
    games_as_p1: int = 0
    wins_as_p0: int = 0
    wins_as_p1: int = 0
    losses_as_p0: int = 0
    losses_as_p1: int = 0
    draws_as_p0: int = 0
    draws_as_p1: int = 0
    
    def __post_init__(self):
        if self.wins_vs is None:
            self.wins_vs = {}
        if self.losses_vs is None:
            self.losses_vs = {}
        if self.draws_vs is None:
            self.draws_vs = {}
    
    @property
    def win_rate(self) -> float:
        if self.total_episodes == 0:
            return 0.0
        return self.wins / self.total_episodes
    
    @property
    def loss_rate(self) -> float:
        if self.total_episodes == 0:
            return 0.0
        return self.losses / self.total_episodes
    
    @property
    def draw_rate(self) -> float:
        if self.total_episodes == 0:
            return 0.0
        return self.draws / self.total_episodes
    
    @property
    def avg_reward(self) -> float:
        if self.total_episodes == 0:
            return 0.0
        return self.total_reward / self.total_episodes
    
    @property
    def avg_episode_length(self) -> float:
        if self.total_episodes == 0:
            return 0.0
        return self.total_episode_length / self.total_episodes
    
    def record_game(
        self, 
        opponent_id: str, 
        result: str,  # 'win', 'loss', 'draw'
        reward: float,
        episode_length: int,
        played_as_p0: bool = True
    ):
        """Record a game result."""
        self.total_episodes += 1
        self.total_reward += reward
        self.total_episode_length += episode_length
        
        # Track position (P0 vs P1)
        if played_as_p0:
            self.games_as_p0 += 1
        else:
            self.games_as_p1 += 1
        
        if result == 'win':
            self.wins += 1
            self.wins_vs[opponent_id] = self.wins_vs.get(opponent_id, 0) + 1
            if played_as_p0:
                self.wins_as_p0 += 1
            else:
                self.wins_as_p1 += 1
        elif result == 'loss':
            self.losses += 1
            self.losses_vs[opponent_id] = self.losses_vs.get(opponent_id, 0) + 1
            if played_as_p0:
                self.losses_as_p0 += 1
            else:
                self.losses_as_p1 += 1
        else:
            self.draws += 1
            self.draws_vs[opponent_id] = self.draws_vs.get(opponent_id, 0) + 1
            if played_as_p0:
                self.draws_as_p0 += 1
            else:
                self.draws_as_p1 += 1
    
    def to_dict(self) -> dict:
        """Convert to dictionary for serialization."""
        return {
            'wins': self.wins,
            'losses': self.losses,
            'draws': self.draws,
            'total_episodes': self.total_episodes,
            'total_reward': self.total_reward,
            'total_episode_length': self.total_episode_length,
            'wins_vs': self.wins_vs,
            'losses_vs': self.losses_vs,
            'draws_vs': self.draws_vs,
            # Computed rates
            'win_rate': self.win_rate,
            'loss_rate': self.loss_rate,
            'draw_rate': self.draw_rate,
            # Position stats
            'games_as_p0': self.games_as_p0,
            'games_as_p1': self.games_as_p1,
            'wins_as_p0': self.wins_as_p0,
            'wins_as_p1': self.wins_as_p1,
            'losses_as_p0': self.losses_as_p0,
            'losses_as_p1': self.losses_as_p1,
            'draws_as_p0': self.draws_as_p0,
            'draws_as_p1': self.draws_as_p1,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'AgentStats':
        """Create from dictionary."""
        stats = cls()
        stats.wins = data.get('wins', 0)
        stats.losses = data.get('losses', 0)
        stats.draws = data.get('draws', 0)
        stats.total_episodes = data.get('total_episodes', 0)
        stats.total_reward = data.get('total_reward', 0.0)
        stats.total_episode_length = data.get('total_episode_length', 0)
        stats.wins_vs = data.get('wins_vs', {})
        stats.losses_vs = data.get('losses_vs', {})
        stats.draws_vs = data.get('draws_vs', {})
        # Position stats
        stats.games_as_p0 = data.get('games_as_p0', 0)
        stats.games_as_p1 = data.get('games_as_p1', 0)
        stats.wins_as_p0 = data.get('wins_as_p0', 0)
        stats.wins_as_p1 = data.get('wins_as_p1', 0)
        stats.losses_as_p0 = data.get('losses_as_p0', 0)
        stats.losses_as_p1 = data.get('losses_as_p1', 0)
        stats.draws_as_p0 = data.get('draws_as_p0', 0)
        stats.draws_as_p1 = data.get('draws_as_p1', 0)
        return stats


class Agent:
    """
    A single RL agent with its own network and optimizer.
    """
    
    def __init__(
        self, 
        agent_id: str, 
        config: MultiAgentConfig,
        device: torch.device
    ):
        self.agent_id = agent_id
        self.config = config
        self.device = device
        
        # Initialize network
        self.network = PolicyValueNetwork(config).to(device)
        
        # Initialize optimizer
        self.optimizer = torch.optim.Adam(
            self.network.parameters(),
            lr=config.learning_rate
        )
        
        # Training state
        self.training_step = 0
        self.stats = AgentStats()
        
        # History for plotting
        self.win_rate_history: List[float] = []
        self.avg_reward_history: List[float] = []
        self.avg_length_history: List[float] = []
        self.iteration_history: List[int] = []
        
    def get_action(
        self,
        board_state: np.ndarray,
        global_features: np.ndarray,
        action_mask: np.ndarray,
        deterministic: bool = False
    ) -> Tuple[int, float, float]:
        """
        Select an action given the current state.
        
        Returns:
            action: Selected action index
            log_prob: Log probability of action
            value: State value estimate
        """
        self.network.eval()
        with torch.no_grad():
            board_t = torch.FloatTensor(board_state).unsqueeze(0).to(self.device)
            global_t = torch.FloatTensor(global_features).unsqueeze(0).to(self.device)
            mask_t = torch.FloatTensor(action_mask).unsqueeze(0).to(self.device)
            
            policy_logits, value = self.network(board_t, global_t)
            
            # Mask invalid actions with -inf to ensure they are NEVER selected
            masked_logits = policy_logits.clone()
            masked_logits[mask_t == 0] = float('-inf')
            
            # softmax(-inf) = 0, so illegal actions have zero probability
            probs = F.softmax(masked_logits, dim=-1)
            probs = probs.clamp(min=1e-10)  # Avoid numerical issues
            
            if deterministic:
                action = probs.argmax(dim=-1)
            else:
                dist = Categorical(probs)
                action = dist.sample()
            
            # Verify action is legal (should always be true with proper masking)
            selected_action = action.item()
            if mask_t[0, selected_action].item() == 0:
                # Fallback: select first legal action (should never happen)
                legal_actions = torch.where(mask_t[0] > 0)[0]
                if len(legal_actions) > 0:
                    selected_action = legal_actions[0].item()
                else:
                    selected_action = 0  # End turn fallback
            
            log_prob = torch.log(probs[0, selected_action] + 1e-10)
            
            return selected_action, log_prob.item(), value.item()
    
    def update(self, trajectories: List[dict]) -> Dict[str, float]:
        """
        Update the agent using collected trajectories.
        
        Args:
            trajectories: List of trajectory dictionaries containing:
                - board_states: List of board states
                - global_features: List of global features
                - action_masks: List of action masks
                - actions: List of actions taken
                - log_probs: List of log probabilities
                - values: List of value estimates
                - rewards: List of rewards
                - dones: List of done flags
                
        Returns:
            Dictionary of training metrics
        """
        self.network.train()
        
        # Flatten all trajectories
        all_boards = []
        all_globals = []
        all_masks = []
        all_actions = []
        all_old_log_probs = []
        all_returns = []
        all_advantages = []
        
        for traj in trajectories:
            # VALIDATE: Ensure all actions in trajectory are legal
            # This assertion should NEVER fail if action masking is working correctly
            for i, (action, mask) in enumerate(zip(traj['actions'], traj['action_masks'])):
                if mask[action] == 0:
                    raise ValueError(
                        f"ILLEGAL ACTION IN TRAJECTORY: action={action} has mask=0. "
                        f"This should NEVER happen with proper action masking!"
                    )
            
            # Compute returns and advantages using GAE
            rewards = traj['rewards']
            values = traj['values']
            dones = traj['dones']
            
            returns = []
            advantages = []
            gae = 0
            next_value = 0
            
            for t in reversed(range(len(rewards))):
                if t == len(rewards) - 1:
                    next_value = 0 if dones[t] else values[t]
                else:
                    next_value = values[t + 1]
                
                delta = rewards[t] + self.config.gamma * next_value * (1 - dones[t]) - values[t]
                gae = delta + self.config.gamma * self.config.gae_lambda * (1 - dones[t]) * gae
                advantages.insert(0, gae)
                returns.insert(0, gae + values[t])
            
            all_boards.extend(traj['board_states'])
            all_globals.extend(traj['global_features'])
            all_masks.extend(traj['action_masks'])
            all_actions.extend(traj['actions'])
            all_old_log_probs.extend(traj['log_probs'])
            all_returns.extend(returns)
            all_advantages.extend(advantages)
        
        if len(all_boards) == 0:
            return {}
        
        # Convert to tensors
        boards_t = torch.FloatTensor(np.array(all_boards)).to(self.device)
        globals_t = torch.FloatTensor(np.array(all_globals)).to(self.device)
        masks_t = torch.FloatTensor(np.array(all_masks)).to(self.device)
        actions_t = torch.LongTensor(all_actions).to(self.device)
        old_log_probs_t = torch.FloatTensor(all_old_log_probs).to(self.device)
        returns_t = torch.FloatTensor(all_returns).to(self.device)
        advantages_t = torch.FloatTensor(all_advantages).to(self.device)
        
        # Normalize advantages
        advantages_t = (advantages_t - advantages_t.mean()) / (advantages_t.std() + 1e-8)
        
        # PPO update
        total_policy_loss = 0
        total_value_loss = 0
        total_entropy = 0
        num_updates = 0
        
        dataset_size = len(all_boards)
        indices = np.arange(dataset_size)
        
        for _ in range(self.config.ppo_epochs):
            np.random.shuffle(indices)
            
            for start in range(0, dataset_size, self.config.mini_batch_size):
                end = min(start + self.config.mini_batch_size, dataset_size)
                batch_indices = indices[start:end]
                
                batch_boards = boards_t[batch_indices]
                batch_globals = globals_t[batch_indices]
                batch_masks = masks_t[batch_indices]
                batch_actions = actions_t[batch_indices]
                batch_old_log_probs = old_log_probs_t[batch_indices]
                batch_returns = returns_t[batch_indices]
                batch_advantages = advantages_t[batch_indices]
                
                # Get new policy outputs
                _, new_log_probs, entropy, new_values = self.network.get_action_and_value(
                    batch_boards, batch_globals, batch_masks, batch_actions
                )
                
                # Policy loss (PPO clipped objective)
                ratio = torch.exp(new_log_probs - batch_old_log_probs)
                surr1 = ratio * batch_advantages
                surr2 = torch.clamp(ratio, 1 - self.config.clip_epsilon, 1 + self.config.clip_epsilon) * batch_advantages
                policy_loss = -torch.min(surr1, surr2).mean()
                
                # Value loss
                value_loss = F.mse_loss(new_values, batch_returns)
                
                # Total loss
                loss = (
                    policy_loss 
                    + self.config.value_coef * value_loss 
                    - self.config.entropy_coef * entropy.mean()
                )
                
                # Update
                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.network.parameters(), self.config.max_grad_norm)
                self.optimizer.step()
                
                total_policy_loss += policy_loss.item()
                total_value_loss += value_loss.item()
                total_entropy += entropy.mean().item()
                num_updates += 1
        
        self.training_step += 1
        
        return {
            'policy_loss': total_policy_loss / max(num_updates, 1),
            'value_loss': total_value_loss / max(num_updates, 1),
            'entropy': total_entropy / max(num_updates, 1)
        }
    
    def record_history(self, iteration: int):
        """Record current stats for plotting."""
        self.iteration_history.append(iteration)
        self.win_rate_history.append(self.stats.win_rate)
        self.avg_reward_history.append(self.stats.avg_reward)
        self.avg_length_history.append(self.stats.avg_episode_length)
    
    def save_checkpoint(self, path: str):
        """Save agent checkpoint."""
        torch.save({
            'agent_id': self.agent_id,
            'network_state_dict': self.network.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'training_step': self.training_step,
            'stats': self.stats.to_dict(),
            'win_rate_history': self.win_rate_history,
            'avg_reward_history': self.avg_reward_history,
            'avg_length_history': self.avg_length_history,
            'iteration_history': self.iteration_history
        }, path)
    
    def load_checkpoint(self, path: str):
        """Load agent checkpoint."""
        checkpoint = torch.load(path, map_location=self.device)
        self.network.load_state_dict(checkpoint['network_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.training_step = checkpoint['training_step']
        self.stats = AgentStats.from_dict(checkpoint['stats'])
        self.win_rate_history = checkpoint.get('win_rate_history', [])
        self.avg_reward_history = checkpoint.get('avg_reward_history', [])
        self.avg_length_history = checkpoint.get('avg_length_history', [])
        self.iteration_history = checkpoint.get('iteration_history', [])
