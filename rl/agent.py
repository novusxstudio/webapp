"""
PPO Agent Implementation
========================

Implements a PPO (Proximal Policy Optimization) agent for the self-play system.

Why PPO over DQN:
1. On-policy learning is more stable for self-play where opponents change
2. No replay buffer needed - better for alternating turn games
3. Natural handling of continuous training as opponent improves
4. Better sample efficiency for games with long episodes
5. Entropy bonus encourages exploration
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from collections import deque

from .model import PolicyValueNetwork, ActorCritic, create_model


@dataclass
class Transition:
    """Single transition in a rollout."""
    observation: np.ndarray
    action: int
    reward: float
    next_observation: np.ndarray
    done: bool
    log_prob: float
    value: float
    action_mask: np.ndarray


@dataclass
class RolloutBuffer:
    """Buffer to store rollout data for PPO training."""
    observations: List[np.ndarray] = field(default_factory=list)
    actions: List[int] = field(default_factory=list)
    rewards: List[float] = field(default_factory=list)
    dones: List[bool] = field(default_factory=list)
    log_probs: List[float] = field(default_factory=list)
    values: List[float] = field(default_factory=list)
    action_masks: List[np.ndarray] = field(default_factory=list)
    advantages: Optional[np.ndarray] = None
    returns: Optional[np.ndarray] = None
    
    def add(self, transition: Transition):
        """Add a transition to the buffer."""
        self.observations.append(transition.observation)
        self.actions.append(transition.action)
        self.rewards.append(transition.reward)
        self.dones.append(transition.done)
        self.log_probs.append(transition.log_prob)
        self.values.append(transition.value)
        self.action_masks.append(transition.action_mask)
    
    def compute_returns_and_advantages(
        self,
        last_value: float,
        gamma: float = 0.99,
        gae_lambda: float = 0.95
    ):
        """
        Compute returns and GAE advantages.
        
        Args:
            last_value: Value estimate for the last state
            gamma: Discount factor
            gae_lambda: GAE lambda parameter
        """
        n = len(self.rewards)
        self.advantages = np.zeros(n, dtype=np.float32)
        self.returns = np.zeros(n, dtype=np.float32)
        
        last_gae = 0
        for t in reversed(range(n)):
            if t == n - 1:
                next_value = last_value
                next_non_terminal = 1.0 - float(self.dones[t])
            else:
                next_value = self.values[t + 1]
                next_non_terminal = 1.0 - float(self.dones[t])
            
            delta = self.rewards[t] + gamma * next_value * next_non_terminal - self.values[t]
            self.advantages[t] = last_gae = delta + gamma * gae_lambda * next_non_terminal * last_gae
            self.returns[t] = self.advantages[t] + self.values[t]
        
        # Normalize advantages
        self.advantages = (self.advantages - self.advantages.mean()) / (self.advantages.std() + 1e-8)
    
    def get_batches(self, batch_size: int):
        """Generate mini-batches for training."""
        n = len(self.observations)
        indices = np.random.permutation(n)
        
        for start in range(0, n, batch_size):
            end = min(start + batch_size, n)
            batch_indices = indices[start:end]
            
            yield {
                'observations': np.array([self.observations[i] for i in batch_indices]),
                'actions': np.array([self.actions[i] for i in batch_indices]),
                'log_probs': np.array([self.log_probs[i] for i in batch_indices]),
                'advantages': self.advantages[batch_indices],
                'returns': self.returns[batch_indices],
                'action_masks': np.array([self.action_masks[i] for i in batch_indices]),
            }
    
    def clear(self):
        """Clear the buffer."""
        self.observations = []
        self.actions = []
        self.rewards = []
        self.dones = []
        self.log_probs = []
        self.values = []
        self.action_masks = []
        self.advantages = None
        self.returns = None
    
    def __len__(self):
        return len(self.observations)


class PPOAgent:
    """
    PPO Agent for self-play training.
    
    Each agent has its own network weights but shares the architecture.
    """
    
    def __init__(
        self,
        observation_size: int,
        action_size: int,
        config: Dict,
        device: str = "cpu",
        agent_id: str = "agent"
    ):
        """
        Initialize the PPO agent.
        
        Args:
            observation_size: Size of the observation vector
            action_size: Size of the action space
            config: Configuration dictionary
            device: Device to use for training
            agent_id: Identifier for this agent
        """
        self.observation_size = observation_size
        self.action_size = action_size
        self.config = config
        self.device = torch.device(device)
        self.agent_id = agent_id
        
        # PPO hyperparameters
        ppo_config = config.get("training", {}).get("ppo", {})
        self.learning_rate = ppo_config.get("learning_rate", 3e-4)
        self.gamma = ppo_config.get("gamma", 0.99)
        self.gae_lambda = ppo_config.get("gae_lambda", 0.95)
        self.clip_epsilon = ppo_config.get("clip_epsilon", 0.2)
        self.value_loss_coef = ppo_config.get("value_loss_coef", 0.5)
        self.entropy_coef = ppo_config.get("entropy_coef", 0.01)
        self.max_grad_norm = ppo_config.get("max_grad_norm", 0.5)
        self.n_epochs = ppo_config.get("n_epochs", 4)
        self.batch_size = ppo_config.get("batch_size", 64)
        
        # Create network
        self.network = create_model(observation_size, action_size, config)
        self.network.to(self.device)
        self.actor_critic = ActorCritic(self.network)
        
        # Optimizer
        self.optimizer = optim.Adam(self.network.parameters(), lr=self.learning_rate)
        
        # Rollout buffer
        self.buffer = RolloutBuffer()
        
        # Statistics
        self.training_stats = {
            "policy_loss": [],
            "value_loss": [],
            "entropy": [],
            "total_loss": [],
        }
        
        # ELO rating for self-play evaluation
        self.elo_rating = 1000.0
    
    def select_action(
        self,
        observation: np.ndarray,
        action_mask: np.ndarray,
        deterministic: bool = False,
        turn_number: int = 1,
        training: bool = True
    ) -> Tuple[int, float, float]:
        """
        Select an action given an observation using temperature-based exploration.
        
        EXPLORATION RULES:
        - During training: Use temperature-scaled sampling
          - Turn <= 10: High temperature (T=1.5) for exploration
          - Turn > 10: Lower temperature (T=0.7) for exploitation
        - During evaluation/inference: Always use argmax (deterministic)
        - Illegal actions: Always masked to zero probability BEFORE softmax
        
        Args:
            observation: The current observation
            action_mask: Mask of valid actions (1 for valid, 0 for invalid)
            deterministic: If True, use argmax (for evaluation/inference)
            turn_number: Current game turn (for temperature scheduling)
            training: Whether in training mode (enables temperature exploration)
            
        Returns:
            action: The selected action index
            log_prob: Log probability of the action
            value: Value estimate of the state
        """
        with torch.no_grad():
            obs_tensor = torch.FloatTensor(observation).unsqueeze(0).to(self.device)
            mask_tensor = torch.FloatTensor(action_mask).unsqueeze(0).to(self.device)
            
            # Get raw logits and value from network
            action_logits, value = self.actor_critic.network(obs_tensor, mask_tensor)
            
            # ─────────────────────────────────────────────────────────────
            # ILLEGAL ACTION MASKING (CRITICAL)
            # Mask MUST be applied BEFORE softmax to ensure illegal actions
            # have exactly zero probability
            # ─────────────────────────────────────────────────────────────
            masked_logits = action_logits.clone()
            masked_logits[mask_tensor == 0] = float('-inf')
            
            if deterministic or not training:
                # ─────────────────────────────────────────────────────────
                # EVALUATION/INFERENCE: Always use argmax
                # No exploration during play against humans or evaluation
                # ─────────────────────────────────────────────────────────
                action = masked_logits.argmax(dim=-1)
                # Compute log_prob for the chosen action
                probs = torch.softmax(masked_logits, dim=-1)
                log_prob = torch.log(probs[0, action] + 1e-10)
            else:
                # ─────────────────────────────────────────────────────────
                # TRAINING: Temperature-based exploration
                # High temp early (explore), low temp later (exploit)
                # ─────────────────────────────────────────────────────────
                temperature = self._get_temperature(turn_number)
                scaled_logits = masked_logits / temperature
                probs = torch.softmax(scaled_logits, dim=-1)
                
                # Sample action from temperature-scaled distribution
                dist = torch.distributions.Categorical(probs=probs)
                action = dist.sample()
                log_prob = dist.log_prob(action)
            
        return action.item(), log_prob.item(), value.squeeze(-1).item()
    
    def _get_temperature(self, turn_number: int) -> float:
        """
        Get exploration temperature based on turn number.
        
        Temperature schedule:
        - Turn <= threshold: High temperature (more exploration)
        - Turn > threshold: Low temperature (more exploitation)
        
        This encourages diverse opening play while focusing on
        optimal play in the mid/late game.
        
        Args:
            turn_number: Current game turn
            
        Returns:
            Temperature value for softmax scaling
        """
        exploration_config = self.config.get("exploration", {})
        temp_early = exploration_config.get("temperature_early", 1.5)
        temp_late = exploration_config.get("temperature_late", 0.7)
        threshold = exploration_config.get("temperature_threshold", 10)
        
        if turn_number <= threshold:
            return temp_early
        else:
            return temp_late
    
    def store_transition(self, transition: Transition):
        """Store a transition in the rollout buffer."""
        self.buffer.add(transition)
    
    def update(self, last_value: float = 0.0) -> Dict[str, float]:
        """
        Perform a PPO update using the stored rollout data.
        
        Args:
            last_value: Value estimate for the last state (for bootstrapping)
            
        Returns:
            Dictionary of training statistics
        """
        if len(self.buffer) == 0:
            return {}
        
        # Compute returns and advantages
        self.buffer.compute_returns_and_advantages(
            last_value,
            self.gamma,
            self.gae_lambda
        )
        
        # Training loop
        total_policy_loss = 0
        total_value_loss = 0
        total_entropy = 0
        num_updates = 0
        
        for _ in range(self.n_epochs):
            for batch in self.buffer.get_batches(self.batch_size):
                # Convert to tensors
                obs = torch.FloatTensor(batch['observations']).to(self.device)
                actions = torch.LongTensor(batch['actions']).to(self.device)
                old_log_probs = torch.FloatTensor(batch['log_probs']).to(self.device)
                advantages = torch.FloatTensor(batch['advantages']).to(self.device)
                returns = torch.FloatTensor(batch['returns']).to(self.device)
                action_masks = torch.FloatTensor(batch['action_masks']).to(self.device)
                
                # Get current policy outputs
                log_probs, values, entropy = self.actor_critic.evaluate_actions(
                    obs, actions, action_masks
                )
                
                # Policy loss (clipped surrogate objective)
                ratio = torch.exp(log_probs - old_log_probs)
                surr1 = ratio * advantages
                surr2 = torch.clamp(ratio, 1 - self.clip_epsilon, 1 + self.clip_epsilon) * advantages
                policy_loss = -torch.min(surr1, surr2).mean()
                
                # Value loss (clipped or unclipped)
                value_loss = F.mse_loss(values, returns)
                
                # Entropy bonus
                entropy_loss = -entropy.mean()
                
                # Total loss
                loss = (
                    policy_loss +
                    self.value_loss_coef * value_loss +
                    self.entropy_coef * entropy_loss
                )
                
                # Optimize
                self.optimizer.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.network.parameters(), self.max_grad_norm)
                self.optimizer.step()
                
                total_policy_loss += policy_loss.item()
                total_value_loss += value_loss.item()
                total_entropy += -entropy_loss.item()
                num_updates += 1
        
        # Clear buffer
        self.buffer.clear()
        
        # Record statistics
        stats = {
            "policy_loss": total_policy_loss / num_updates,
            "value_loss": total_value_loss / num_updates,
            "entropy": total_entropy / num_updates,
        }
        
        for key, value in stats.items():
            self.training_stats[key].append(value)
        
        return stats
    
    def save_checkpoint(self, path: str, extra_data: Optional[Dict] = None):
        """
        Save a checkpoint.
        
        Args:
            path: Path to save the checkpoint
            extra_data: Additional data to save
        """
        checkpoint = {
            "network_state_dict": self.network.state_dict(),
            "optimizer_state_dict": self.optimizer.state_dict(),
            "elo_rating": self.elo_rating,
            "training_stats": self.training_stats,
            "config": self.config,
            "agent_id": self.agent_id,
        }
        
        if extra_data:
            checkpoint.update(extra_data)
        
        torch.save(checkpoint, path)
    
    def load_checkpoint(self, path: str, load_optimizer: bool = True) -> Dict:
        """
        Load a checkpoint.
        
        Args:
            path: Path to the checkpoint
            load_optimizer: Whether to load optimizer state
            
        Returns:
            Extra data from the checkpoint
        """
        checkpoint = torch.load(path, map_location=self.device)
        
        self.network.load_state_dict(checkpoint["network_state_dict"])
        
        if load_optimizer and "optimizer_state_dict" in checkpoint:
            self.optimizer.load_state_dict(checkpoint["optimizer_state_dict"])
        
        if "elo_rating" in checkpoint:
            self.elo_rating = checkpoint["elo_rating"]
        
        if "training_stats" in checkpoint:
            self.training_stats = checkpoint["training_stats"]
        
        return checkpoint
    
    def copy_weights_from(self, other: "PPOAgent"):
        """Copy network weights from another agent."""
        self.network.load_state_dict(other.network.state_dict())
    
    def get_weights(self) -> Dict:
        """Get network weights as a dictionary."""
        return self.network.state_dict()
    
    def set_weights(self, weights: Dict):
        """Set network weights from a dictionary."""
        self.network.load_state_dict(weights)
    
    def update_elo(self, opponent_elo: float, result: float, k: float = 32):
        """
        Update ELO rating after a game.
        
        Args:
            opponent_elo: Opponent's ELO rating
            result: Game result (1 for win, 0.5 for draw, 0 for loss)
            k: K-factor for ELO update
        """
        expected = 1 / (1 + 10 ** ((opponent_elo - self.elo_rating) / 400))
        self.elo_rating += k * (result - expected)


# Import F for loss computation
import torch.nn.functional as F


def create_agent(
    observation_size: int,
    action_size: int,
    config: Dict,
    device: str = "cpu",
    agent_id: str = "agent"
) -> PPOAgent:
    """
    Factory function to create a PPO agent.
    
    Args:
        observation_size: Size of the observation vector
        action_size: Size of the action space
        config: Configuration dictionary
        device: Device to use
        agent_id: Identifier for the agent
        
    Returns:
        PPOAgent instance
    """
    return PPOAgent(
        observation_size=observation_size,
        action_size=action_size,
        config=config,
        device=device,
        agent_id=agent_id
    )
