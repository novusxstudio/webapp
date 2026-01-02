"""
Neural Network Model for the RL Agent
=====================================

Implements a policy-value network suitable for PPO training.
The network outputs both action probabilities and state value estimates.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, Optional


class ResidualBlock(nn.Module):
    """Residual block with skip connection."""
    
    def __init__(self, hidden_size: int, dropout: float = 0.1):
        super().__init__()
        self.fc1 = nn.Linear(hidden_size, hidden_size)
        self.fc2 = nn.Linear(hidden_size, hidden_size)
        self.dropout = nn.Dropout(dropout)
        self.layer_norm = nn.LayerNorm(hidden_size)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = x
        x = F.relu(self.fc1(x))
        x = self.dropout(x)
        x = self.fc2(x)
        x = self.layer_norm(x + residual)
        return F.relu(x)


class SpatialEncoder(nn.Module):
    """
    Encodes the spatial board state using convolutional layers.
    """
    
    def __init__(self, input_channels: int, hidden_size: int):
        super().__init__()
        # Use conv layers to capture spatial relationships
        self.conv1 = nn.Conv2d(input_channels, 64, kernel_size=3, padding=1)
        self.conv2 = nn.Conv2d(64, 128, kernel_size=3, padding=1)
        self.conv3 = nn.Conv2d(128, 128, kernel_size=3, padding=1)
        
        # Flatten and project to hidden size
        # After conv: 5x5x128 = 3200
        self.fc = nn.Linear(5 * 5 * 128, hidden_size)
        self.layer_norm = nn.LayerNorm(hidden_size)
        
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Spatial features of shape (batch, channels, height, width)
        """
        x = F.relu(self.conv1(x))
        x = F.relu(self.conv2(x))
        x = F.relu(self.conv3(x))
        x = x.contiguous().view(x.size(0), -1)  # Flatten (ensure contiguous for view)
        x = self.fc(x)
        return self.layer_norm(F.relu(x))


class PolicyValueNetwork(nn.Module):
    """
    Combined policy and value network for PPO.
    
    Architecture:
    - Spatial encoder for board state
    - Global feature encoder
    - Shared hidden layers
    - Separate policy and value heads
    """
    
    def __init__(
        self,
        observation_size: int,
        action_size: int,
        hidden_size: int = 256,
        num_layers: int = 3,
        dropout: float = 0.1,
        spatial_channels: int = 11,
        grid_size: int = 5,
        global_features: int = 7
    ):
        super().__init__()
        
        self.observation_size = observation_size
        self.action_size = action_size
        self.spatial_channels = spatial_channels
        self.grid_size = grid_size
        self.global_features = global_features
        
        # Spatial encoder
        self.spatial_encoder = SpatialEncoder(spatial_channels, hidden_size)
        
        # Global feature encoder
        self.global_encoder = nn.Sequential(
            nn.Linear(global_features, hidden_size // 4),
            nn.ReLU(),
            nn.Linear(hidden_size // 4, hidden_size // 2),
            nn.ReLU()
        )
        
        # Combined feature size
        combined_size = hidden_size + hidden_size // 2
        
        # Shared hidden layers
        self.shared_layers = nn.ModuleList()
        self.shared_layers.append(nn.Linear(combined_size, hidden_size))
        for _ in range(num_layers - 1):
            self.shared_layers.append(ResidualBlock(hidden_size, dropout))
        
        # Policy head
        self.policy_head = nn.Sequential(
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, action_size)
        )
        
        # Value head
        self.value_head = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Linear(hidden_size // 2, 1)
        )
        
        # Initialize weights
        self._init_weights()
        
    def _init_weights(self):
        """Initialize network weights."""
        for module in self.modules():
            if isinstance(module, (nn.Linear, nn.Conv2d)):
                nn.init.orthogonal_(module.weight, gain=0.01)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
    
    def forward(
        self, 
        observation: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Forward pass through the network.
        
        Args:
            observation: Flattened observation of shape (batch, observation_size)
            action_mask: Boolean mask of valid actions (batch, action_size)
            
        Returns:
            action_logits: Log probabilities over actions (batch, action_size)
            value: State value estimate (batch, 1)
        """
        batch_size = observation.shape[0]
        
        # Split observation into spatial and global parts
        spatial_size = self.grid_size * self.grid_size * self.spatial_channels
        spatial_flat = observation[:, :spatial_size]
        global_features = observation[:, spatial_size:]
        
        # Reshape spatial for conv layers: (batch, channels, height, width)
        spatial = spatial_flat.view(batch_size, self.grid_size, self.grid_size, self.spatial_channels)
        spatial = spatial.permute(0, 3, 1, 2)  # (batch, channels, height, width)
        
        # Encode spatial and global features
        spatial_encoded = self.spatial_encoder(spatial)
        global_encoded = self.global_encoder(global_features)
        
        # Combine features
        combined = torch.cat([spatial_encoded, global_encoded], dim=-1)
        
        # Shared layers
        x = F.relu(self.shared_layers[0](combined))
        for layer in self.shared_layers[1:]:
            x = layer(x)
        
        # Policy head
        action_logits = self.policy_head(x)
        
        # Apply action mask (set invalid actions to very low probability)
        if action_mask is not None:
            # Mask should be 1 for valid actions, 0 for invalid
            invalid_mask = (action_mask == 0)
            action_logits = action_logits.masked_fill(invalid_mask, float('-inf'))
        
        # Value head
        value = self.value_head(x)
        
        return action_logits, value
    
    def get_action_probs(
        self, 
        observation: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """Get action probabilities (softmax of logits)."""
        action_logits, _ = self.forward(observation, action_mask)
        return F.softmax(action_logits, dim=-1)
    
    def get_value(self, observation: torch.Tensor) -> torch.Tensor:
        """Get just the value estimate."""
        _, value = self.forward(observation)
        return value


class ActorCritic(nn.Module):
    """
    Wrapper that provides actor-critic interface for PPO.
    """
    
    def __init__(self, policy_value_net: PolicyValueNetwork):
        super().__init__()
        self.network = policy_value_net
        
    def forward(
        self,
        observation: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None
    ) -> Tuple[torch.distributions.Categorical, torch.Tensor]:
        """
        Get action distribution and value.
        
        Returns:
            dist: Categorical distribution over actions
            value: State value estimate
        """
        action_logits, value = self.network(observation, action_mask)
        dist = torch.distributions.Categorical(logits=action_logits)
        return dist, value.squeeze(-1)
    
    def evaluate_actions(
        self,
        observation: torch.Tensor,
        actions: torch.Tensor,
        action_mask: Optional[torch.Tensor] = None
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Evaluate given actions for PPO loss computation.
        
        Returns:
            log_probs: Log probability of the actions
            values: State value estimates
            entropy: Entropy of the action distribution
        """
        dist, values = self.forward(observation, action_mask)
        log_probs = dist.log_prob(actions)
        entropy = dist.entropy()
        return log_probs, values, entropy


def create_model(
    observation_size: int,
    action_size: int,
    config: dict
) -> PolicyValueNetwork:
    """
    Factory function to create a model from config.
    
    Args:
        observation_size: Size of the observation vector
        action_size: Size of the action space
        config: Model configuration dictionary
        
    Returns:
        PolicyValueNetwork instance
    """
    model_config = config.get("model", {})
    
    return PolicyValueNetwork(
        observation_size=observation_size,
        action_size=action_size,
        hidden_size=model_config.get("hidden_size", 256),
        num_layers=model_config.get("num_layers", 3),
        dropout=model_config.get("dropout", 0.1),
    )
