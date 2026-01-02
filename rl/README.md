# Multi-Agent Self-Play Reinforcement Learning

This module implements a multi-agent self-play reinforcement learning system for the NovusX game, featuring 8 independent agents (A-H) that learn through competitive play.

## Overview

- **8 Agents**: Independent neural networks (A, B, C, D, E, F, G, H)
- **Algorithm**: Proximal Policy Optimization (PPO)
- **Training**: Round-robin self-play with random agent pairing
- **Architecture**: CNN with residual blocks for spatial features + MLP for global features

## Files

| File | Description |
|------|-------------|
| `multi_agent_config.py` | Configuration dataclass with all hyperparameters |
| `multi_agent.py` | Agent class with PolicyValueNetwork and PPO update |
| `multi_agent_env.py` | Environment wrapper with observation/action encoding |
| `multi_agent_utils.py` | Checkpoint management and plotting utilities |
| `train_multi_agent.py` | Main training script |
| `evaluate_agents.py` | Tournament and evaluation script |

## Quick Start

### 1. Install Dependencies

```bash
cd rl
pip install -r requirements.txt
```

### 2. Train Agents

```bash
# Start training from scratch
python train_multi_agent.py --iterations 100000

# Resume from checkpoint
python train_multi_agent.py --resume --iterations 200000

# Train on GPU with custom checkpoint directory
python train_multi_agent.py --device cuda --checkpoint-dir my_checkpoints
```

### 3. Evaluate Trained Agents

```bash
# Run tournament between all agents
python evaluate_agents.py --tournament --games 100

# Test against random baseline
python evaluate_agents.py --vs-random --games 50

# Evaluate specific agents only
python evaluate_agents.py --tournament --agents A B C D --games 50
```

## Configuration

Edit `multi_agent_config.py` to customize:

```python
@dataclass
class MultiAgentConfig:
    # Agents
    agent_ids: List[str] = ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')
    
    # Neural Network
    hidden_channels: int = 64
    num_res_blocks: int = 4
    global_hidden_dim: int = 128
    
    # PPO Hyperparameters
    lr: float = 3e-4
    gamma: float = 0.99
    gae_lambda: float = 0.95
    clip_epsilon: float = 0.2
    value_loss_coef: float = 0.5
    entropy_coef: float = 0.01
    
    # Training
    max_turns: int = 200
    ppo_epochs: int = 4
    mini_batch_size: int = 32
    
    # Rewards
    reward_win: float = 1.0
    reward_loss: float = -1.0
    reward_draw_turn_limit: float = -0.1
    reward_draw_other: float = 0.0
    
    # Checkpointing
    checkpoint_small: int = 100     # Save every 100 iterations
    checkpoint_medium: int = 1000   # Generate plots
    checkpoint_large: int = 10000   # Print summary
```

## Observation Space

The observation is a combination of:

### Board State (14 channels × 5 × 5)
| Channel | Description |
|---------|-------------|
| 0 | Own units presence |
| 1-6 | Own unit types (one-hot: Knight, Mage, Archer, etc.) |
| 7 | Enemy units presence |
| 8-13 | Enemy unit types |

### Global Features (20 values)
- Current deployments remaining (0-3)
- Opponent deployments remaining (0-3)
- Own units alive (each type)
- Enemy units alive (each type)
- Control point ownership
- Turn number (normalized)

## Action Space

700 total actions:
- Deploy: 6 unit types × 5 positions × 2 back rows = 60 actions
- Move: 25 tiles × 4 directions = 100 actions
- Rotate: 25 tiles × 4 rotations = 100 actions
- Attack: 25 tiles × 4 directions × 4 attack types = 400 actions
- End Turn: 1 action
- Pass: 1 action

## Checkpointing

Checkpoints are saved at three intervals:
- **Small (100)**: Regular checkpoint, older ones pruned
- **Medium (1000)**: Generate plots, keep milestone
- **Large (10000)**: Print summary, always keep

Directory structure:
```
checkpoints/multi_agent/
├── agent_A/
│   ├── checkpoint_latest.pt
│   ├── checkpoint_1000.pt
│   └── checkpoint_10000.pt
├── agent_B/
│   └── ...
└── training_state.json
```

## Plots Generated

Plots are saved to `plots/multi_agent/`:
- `win_rate_latest.png` - Win rate over training
- `avg_reward_latest.png` - Average reward over time
- `episode_length_latest.png` - Episode length trends
- `elo_ratings_latest.png` - Current ELO rankings
- `matchup_matrix_latest.png` - Head-to-head win rates
- `summary_stats_latest.png` - Overall statistics

## Graceful Shutdown

Press `Ctrl+C` during training to:
1. Finish current iteration
2. Save all agent checkpoints
3. Save training state
4. Generate final plots
5. Print final summary

Press `Ctrl+C` twice to force immediate exit.

## Architecture Details

### PolicyValueNetwork

```
Input:
  - Board observation: 14 channels × 5 × 5
  - Global features: 20 values

Board Processing:
  - Conv2d(14, 64, 3, padding=1) + BatchNorm + ReLU
  - 4× Residual Blocks (Conv-BN-ReLU-Conv-BN + skip)
  - Flatten: 64 × 5 × 5 = 1600

Global Processing:
  - Linear(20, 128) + ReLU

Combined:
  - Concat: 1600 + 128 = 1728
  - Linear(1728, 256) + ReLU

Outputs:
  - Policy: Linear(256, 700) → masked softmax
  - Value: Linear(256, 1) → tanh
```

### PPO Update

For each game:
1. Collect trajectory (states, actions, rewards, log_probs)
2. Compute returns and advantages with GAE
3. Run 4 epochs of mini-batch updates
4. Clip policy ratio to [0.8, 1.2]
5. Combined loss = policy_loss + 0.5 × value_loss - 0.01 × entropy

## Tips for Training

1. **Start with fewer iterations** to verify everything works
2. **Monitor ELO spread** - if all agents converge to similar ELO, increase entropy coefficient
3. **Check win rates against random** - all agents should beat random >80%
4. **Watch episode lengths** - decreasing lengths indicate more decisive play
5. **Resume training** anytime with `--resume` flag
