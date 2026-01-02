"""
Configuration for multi-agent self-play training.
8 agents (A-H) compete against each other in round-robin fashion.
"""

from dataclasses import dataclass, field
from typing import List, Dict
import os

@dataclass
class MultiAgentConfig:
    """Configuration for multi-agent training."""
    
    # Agent identifiers
    agent_ids: List[str] = field(default_factory=lambda: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
    num_agents: int = 8
    
    # Training parameters
    total_iterations: int = 100_000
    episodes_per_iteration: int = 4  # Number of games per iteration
    
    # Network architecture
    hidden_dim: int = 256
    num_hidden_layers: int = 3
    
    # PPO hyperparameters
    learning_rate: float = 3e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_epsilon: float = 0.2
    entropy_coef: float = 0.01
    value_coef: float = 0.5
    max_grad_norm: float = 0.5
    ppo_epochs: int = 4
    mini_batch_size: int = 64
    
    # Rewards
    reward_win: float = 1.0
    reward_loss: float = -1.0
    reward_draw_turn_limit: float = -0.1
    reward_draw_other: float = 0.0
    
    # Checkpointing
    checkpoint_dir: str = "rl/multi_agent_checkpoints"
    checkpoint_interval_small: int = 100
    checkpoint_interval_medium: int = 1_000
    checkpoint_interval_large: int = 10_000
    
    # Logging
    log_interval: int = 10
    plot_dir: str = "rl/multi_agent_plots"
    
    # Game parameters
    max_turns: int = 250
    
    def __post_init__(self):
        """Create directories if they don't exist."""
        os.makedirs(self.checkpoint_dir, exist_ok=True)
        os.makedirs(self.plot_dir, exist_ok=True)
        # Create per-agent checkpoint directories
        for agent_id in self.agent_ids:
            os.makedirs(os.path.join(self.checkpoint_dir, f"agent_{agent_id}"), exist_ok=True)


# Observation space dimensions
GRID_SIZE = 5
NUM_UNIT_TYPES = 6
UNIT_TYPES = ['swordsman', 'shieldman', 'axeman', 'cavalry', 'archer', 'spearman']

# Action space
# Deploy: 6 unit types * 5 columns = 30 actions
# Move: 25 tiles * 4 directions = 100 actions  
# Rotate: 25 tiles * 4 directions = 100 actions
# Attack: 25 tiles * 8 directions (including diagonals) * 2 range = 400 actions
# End turn: 1 action
# Total: ~631 actions (we'll use a flat action space)

# Simplified action space:
# 0: End turn
# 1-30: Deploy (unit_type * 5 + col)
# 31-55: Move from tile (we'll encode source + direction)
# For simplicity, we'll use a larger action space that covers all possibilities

ACTION_SPACE_SIZE = 700  # Generous upper bound

# Observation encoding
# Per tile: 6 unit types * 2 players + 1 empty + 1 control point = 14 channels
# Plus global features
OBS_CHANNELS = 14
GLOBAL_FEATURES = 20  # deployments, counts, turn info, etc.
