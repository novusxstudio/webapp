#!/usr/bin/env python3
"""
Inference script for RL agents - called by the TypeScript backend
Reads game state from stdin, outputs best action to stdout
"""
import sys
import json
import numpy as np
import torch
from pathlib import Path

# Add the rl directory to path
sys.path.insert(0, str(Path(__file__).parent))

from model import PolicyValueNetwork, ActorCritic

# Environment constants (must match env.py and RLAgentBot.ts)
BOARD_SIZE = 5
NUM_UNIT_TYPES = 5
# Observation: 5x5 grid x 11 channels + 7 global features = 275 + 7 = 282
SPATIAL_CHANNELS = 11  # 5 unit types + owner + acted + 4 directional facing
GLOBAL_FEATURES = 7
OBS_DIM = BOARD_SIZE * BOARD_SIZE * SPATIAL_CHANNELS + GLOBAL_FEATURES
ACTION_DIM = 2001

# Cache loaded models to avoid reloading on each call
_model_cache = {}


def load_model(checkpoint_name: str, player_id: int = 0) -> PolicyValueNetwork:
    """Load a model from checkpoint, with caching."""
    cache_key = f"{checkpoint_name}_p{player_id}"
    if cache_key in _model_cache:
        return _model_cache[cache_key]
    
    checkpoint_dir = Path(__file__).parent / "checkpoints" / checkpoint_name
    
    # Try to find agent checkpoint (agent_p0.pt for player 0, agent_p1.pt for player 1)
    agent_file = f"agent_p{player_id}.pt"
    checkpoint_path = checkpoint_dir / agent_file
    
    if not checkpoint_path.exists():
        # Fallback to agent_p0.pt if the specific player checkpoint doesn't exist
        checkpoint_path = checkpoint_dir / "agent_p0.pt"
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Checkpoint not found: {checkpoint_dir}")
    
    # Load checkpoint
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    
    # Get config from checkpoint or use defaults
    config = checkpoint.get('config', {})
    model_config = config.get('model', {})
    
    # Create model with matching architecture
    model = PolicyValueNetwork(
        observation_size=OBS_DIM,
        action_size=ACTION_DIM,
        hidden_size=model_config.get('hidden_size', 256),
        num_layers=model_config.get('num_layers', 3),
        dropout=model_config.get('dropout', 0.1),
        spatial_channels=SPATIAL_CHANNELS,
        grid_size=BOARD_SIZE,
        global_features=GLOBAL_FEATURES,
    )
    
    # Load state dict
    model.load_state_dict(checkpoint['network_state_dict'])
    model.eval()
    
    _model_cache[cache_key] = model
    return model


def state_to_observation(state: dict, player_id: int) -> np.ndarray:
    """Convert game state to observation vector."""
    obs = np.zeros(OBS_DIM, dtype=np.float32)
    idx = 0
    
    # Grid features (5x5 x 11 features per cell)
    # Features per cell: 5 unit types (one-hot) + owner + acted + 4 directional facing
    grid = state['grid']
    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            cell = grid[row][col]
            if cell is not None:
                # One-hot encode unit type (5 types)
                unit_type = cell['type']  # 1-5
                if 1 <= unit_type <= NUM_UNIT_TYPES:
                    obs[idx + unit_type - 1] = 1.0
                # Owner (1 if same as player_id, -1 if opponent)
                obs[idx + NUM_UNIT_TYPES] = 1.0 if cell['owner'] == player_id else -1.0
                # Acted this turn
                obs[idx + NUM_UNIT_TYPES + 1] = 1.0 if cell.get('acted', False) else 0.0
                # Directional facing (4 directions) - default to forward
                obs[idx + NUM_UNIT_TYPES + 2] = 0.0  # North
                obs[idx + NUM_UNIT_TYPES + 3] = 0.0  # South
                obs[idx + NUM_UNIT_TYPES + 4] = 0.0  # East
                obs[idx + NUM_UNIT_TYPES + 5] = 0.0  # West
            idx += SPATIAL_CHANNELS
    
    # Game state features (7 total)
    base_idx = BOARD_SIZE * BOARD_SIZE * SPATIAL_CHANNELS
    
    # Current player perspective
    obs[base_idx] = 1.0 if state['currentPlayer'] == player_id else 0.0
    
    # Turn number (normalized)
    obs[base_idx + 1] = min(state['turnNumber'] / 100.0, 1.0)
    
    # Player resources
    my_player = state['players'][player_id]
    opp_player = state['players'][1 - player_id]
    
    obs[base_idx + 2] = my_player['actionsRemaining'] / 3.0
    obs[base_idx + 3] = my_player['deploymentsRemaining'] / 10.0  # Max is 10
    obs[base_idx + 4] = opp_player['actionsRemaining'] / 3.0
    obs[base_idx + 5] = opp_player['deploymentsRemaining'] / 10.0
    
    # Player ID indicator
    obs[base_idx + 6] = float(player_id)
    
    return obs


def get_best_action(model: PolicyValueNetwork, observation: np.ndarray) -> int:
    """Get the best action from the model."""
    with torch.no_grad():
        obs_tensor = torch.FloatTensor(observation).unsqueeze(0)
        action_logits, _ = model(obs_tensor)
        
        # Get action probabilities
        probs = torch.softmax(action_logits, dim=-1).squeeze()
        
        # Return the action with highest probability
        return probs.argmax().item()


def main():
    try:
        # Read input from stdin
        input_data = sys.stdin.read()
        request = json.loads(input_data)
        
        state = request['state']
        checkpoint = request['checkpoint']
        player_id = request['playerId']
        # trainedAsPlayer determines which model file to load (agent_p0.pt or agent_p1.pt)
        trained_as_player = request.get('trainedAsPlayer', player_id)
        
        # Load model (use the model file for the trained player role)
        model = load_model(checkpoint, trained_as_player)
        
        # Convert state to observation (from current player's perspective)
        observation = state_to_observation(state, player_id)
        
        # Get best action
        action = get_best_action(model, observation)
        
        # Output result
        result = {'action': action}
        print(json.dumps(result))
        
    except Exception as e:
        # Output error as JSON
        import traceback
        error_msg = f"{str(e)}\n{traceback.format_exc()}"
        print(json.dumps({'error': error_msg}), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
