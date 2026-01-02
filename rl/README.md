# NovusX Reinforcement Learning System

A fixed-role self-play reinforcement learning system for training AI agents to play the NovusX strategy game using **Proximal Policy Optimization (PPO)**.

## Overview

This system uses **fixed-role self-play** where:
- **AgentP0** ALWAYS plays as player 0 (goes first)
- **AgentP1** ALWAYS plays as player 1 (goes second)
- Agents have identical architectures but **separate weights**
- Weights are **never merged** between agents
- Trained agents can be **challenged in-game** via the Bots page

## Structure

```
rl/
├── __init__.py          # Package initialization
├── config.yaml          # Training configuration (rewards, exploration, PPO hyperparams)
├── env.py               # Gym-style environment with draw detection
├── model.py             # CNN + MLP neural network architecture
├── agent.py             # PPO agent with temperature-based exploration
├── train_self_play.py   # Fixed-role self-play training loop
├── evaluate.py          # Evaluation and comparison tools
├── inference.py         # Called by backend to get RL agent actions
├── checkpoints/         # Milestone checkpoints
│   ├── iter_100/
│   │   ├── agent_p0.pt
│   │   ├── agent_p1.pt
│   │   └── metadata.json
│   ├── iter_1000/
│   ├── iter_10000/
│   └── iter_100000/
└── logs/                # Training logs
```

## Installation

```bash
# From the webapp directory
pip install torch numpy pyyaml tqdm
```

## Quick Start

### 1. Training

Start fixed-role self-play training:

```bash
# From webapp directory
python -m rl.train_self_play

# With custom config and GPU
python -m rl.train_self_play --config rl/config.yaml --device cuda

# Resume from milestone checkpoint
python -m rl.train_self_play --resume rl/checkpoints/iter_1000
```

### 2. Checkpoints

Checkpoints are automatically saved at these milestones:
- **Episode 100** → `rl/checkpoints/iter_100/`
- **Episode 1,000** → `rl/checkpoints/iter_1000/`
- **Episode 10,000** → `rl/checkpoints/iter_10000/`
- **Episode 100,000** → `rl/checkpoints/iter_100000/`

Each checkpoint directory contains:
- `agent_p0.pt` - AgentP0 weights (trained as player 0)
- `agent_p1.pt` - AgentP1 weights (trained as player 1)
- `metadata.json` - Win rates, ELO ratings, draw statistics

### 3. Play Against Trained Agents

Trained agents appear in the **Bots page** of the game UI:
- **P0 agents**: You play as Player 1 (bottom)
- **P1 agents**: You play as Player 0 (top)

The backend calls `inference.py` to get agent actions during gameplay.

### 4. Evaluation

```bash
# Compare two checkpoints
python -m rl.evaluate --mode compare --checkpoints iter_100/agent_p0.pt iter_1000/agent_p0.pt

# Play against AI in terminal
python -m rl.evaluate --mode human --checkpoint rl/checkpoints/iter_1000/agent_p0.pt

# Test against random baseline
python -m rl.evaluate --mode random --checkpoint rl/checkpoints/iter_1000/agent_p0.pt
```

## Configuration (`config.yaml`)

### Rewards

```yaml
rewards:
  # Terminal (assigned once at game end)
  win: 1.0
  lose: -1.0
  draw: 0.0
  
  # Objective shaping (irreversible progress)
  capture_control_point: 0.3
  lose_control_point: -0.3
  control_point_advantage: 0.02  # Per turn if we have CP lead
  
  # Combat shaping
  defeat_enemy_unit: 0.07
  lose_own_unit: -0.07
  
  # Survival shaping (P1 only, early game)
  survival_bonus: 0.005
  survival_max_turn: 25
  
  turn_penalty: -0.001
```

### Exploration

```yaml
exploration:
  # Temperature-based sampling during training
  temperature_early: 1.5   # Turns 1-10: high exploration
  temperature_late: 0.7    # Turns 11+: more exploitation
  temperature_threshold: 10
  
  # Evaluation/inference: always argmax (deterministic)
```

### Draw Detection

```yaml
# Configured in env.py constants
MAX_TURN_LIMIT: 1000           # Max turns before forced draw
REPEATED_STATE_LIMIT: 10       # Same state hash 10x = draw
NO_PROGRESS_TURN_LIMIT: 100    # 100 turns without capture AND death = draw
```

## Architecture

### Fixed-Role Design

```
AgentP0 (Player 0)          AgentP1 (Player 1)
┌─────────────────┐         ┌─────────────────┐
│ Neural Network  │         │ Neural Network  │
│ (Same Arch)     │         │ (Same Arch)     │
├─────────────────┤         ├─────────────────┤
│ Own Weights     │         │ Own Weights     │
│ Own Optimizer   │         │ Own Optimizer   │
│ Own Buffer      │         │ Own Buffer      │
└─────────────────┘         └─────────────────┘
        │                           │
        └───────────┬───────────────┘
                    │
              Game Engine
         (Enforces Turn Order)
```

### Environment (`env.py`)

Wraps the game as a Gym-style environment:
- **Observation**: 5×5 spatial grid × 11 channels + 7 global features = 282 dims
- **Action space**: 2001 discrete actions (deploy, move, attack, rotate, end_turn)
- **Action masking**: Invalid actions masked to zero probability before softmax
- **Draw detection**: Max turns, repeated states, no-progress stalemates

### Neural Network (`model.py`)

```
Observation (282) 
    ↓
┌───────────────────────────────────────┐
│ Spatial: 5×5×11 → CNN → 128 features  │
│ Global: 7 features → MLP → 32         │
└───────────────────────────────────────┘
    ↓ concat
Shared MLP (256 → 256 → 256)
    ↓
┌─────────────┬─────────────┐
│ Policy Head │ Value Head  │
│ → 2001 acts │ → 1 value   │
└─────────────┴─────────────┘
```

### PPO Agent (`agent.py`)

Each agent maintains:
- Separate model weights
- Separate Adam optimizer
- Separate rollout buffer
- Separate ELO rating
- Temperature-based exploration (training only)

## Training Progress

Training prints progress every 100 episodes:

```
Episode    100 | P0 Win: 52.0% | P1 Win: 45.0% | Draw: 3.0% | Len:  15.2 | ELO P0: 1012 | ELO P1:  988
Episode    200 | P0 Win: 49.5% | P1 Win: 48.5% | Draw: 2.0% | Len:  16.1 | ELO P0: 1008 | ELO P1: 1004
```

Metadata JSON at each milestone:
```json
{
  "milestone": 1000,
  "total_episodes": 1000,
  "win_rate_agent_p0": 0.512,
  "win_rate_agent_p1": 0.478,
  "draw_rate": 0.010,
  "draw_reasons": {"MAX_TURNS": 2, "REPEATED_STATE": 5, "NO_PROGRESS": 3},
  "average_game_length": 15.7,
  "elo_agent_p0": 1024,
  "elo_agent_p1": 1018,
  "timestamp": "2025-12-31T14:30:00"
}
```

## Integration with Game

The backend (`backend/src/bots/RLAgentBot.ts`) wraps trained agents:
1. Encodes game state to observation vector
2. Calls `inference.py` via Python subprocess
3. Decodes action index to game action
4. Falls back to heuristics if inference fails

Agents are registered in `BOT_REGISTRY` and appear in the Bots page.

## Tips

1. **Fixed roles matter**: P0 has first-mover advantage; slight win rate asymmetry is normal
2. **Use GPU**: Pass `--device cuda` for 5-10x faster training
3. **Watch draw rates**: High draws may indicate stalemate strategies
4. **Temperature tuning**: Lower `temperature_late` for more deterministic mid/late game
5. **Resume cleanly**: The `--resume` flag preserves optimizer states and statistics

## API Usage

```python
from rl.env import NovusXEnv
from rl.train_self_play import FixedRoleSelfPlayTrainer
import yaml

# Load config
with open("rl/config.yaml") as f:
    config = yaml.safe_load(f)

# Create trainer
trainer = FixedRoleSelfPlayTrainer(config, device="cuda")

# Train
trainer.train()

# Or use environment directly
env = NovusXEnv(config.get("env", {}))
obs = env.reset()
action_mask = env.get_valid_actions_mask(player_id=0)
next_obs, reward, done, info = env.step(action=42, player_id=0)
```
