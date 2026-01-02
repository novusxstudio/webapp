# Checkpoints Directory

Stores trained model checkpoints at milestone episodes.

## Directory Structure

```
checkpoints/
├── iter_100/
│   ├── agent_p0.pt      # AgentP0 weights (trained as player 0)
│   ├── agent_p1.pt      # AgentP1 weights (trained as player 1)
│   └── metadata.json    # Training statistics
├── iter_1000/
├── iter_10000/
└── iter_100000/
```

## Checkpoint Format

Each `*.pt` file contains:
- `network_state_dict` - Neural network weights
- `optimizer_state_dict` - Optimizer state (for resuming)
- `config` - Training configuration
- `elo_rating` - Agent's ELO rating
- `episode` - Training episode number

## Metadata JSON

```json
{
  "milestone": 1000,
  "total_episodes": 1000,
  "total_steps": 15234,
  "win_rate_agent_p0": 0.512,
  "win_rate_agent_p1": 0.478,
  "draw_rate": 0.010,
  "total_wins_p0": 512,
  "total_wins_p1": 478,
  "total_draws": 10,
  "draw_reasons": {
    "MAX_TURNS": 2,
    "REPEATED_STATE": 5,
    "NO_PROGRESS": 3
  },
  "average_game_length": 15.7,
  "elo_agent_p0": 1024,
  "elo_agent_p1": 1018,
  "timestamp": "2025-12-31T14:30:00",
  "device": "cuda"
}
```

## Usage

### Load for Evaluation

```python
from rl.evaluate import Evaluator

evaluator = Evaluator()
agent = evaluator.load_agent("rl/checkpoints/iter_1000/agent_p0.pt")
```

### Resume Training

```bash
python -m rl.train_self_play --resume rl/checkpoints/iter_1000
```

### Play in Game

Checkpoints are automatically detected by the backend and appear in the Bots page as RL agents (e.g., "RL Agent iter_1000 (P0)").

## Naming Convention

- `agent_p0.pt` - Agent trained as Player 0 (goes first)
- `agent_p1.pt` - Agent trained as Player 1 (goes second)
- When challenging P0 agents, human plays as Player 1 (and vice versa)
