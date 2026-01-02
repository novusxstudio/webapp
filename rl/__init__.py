"""
NovusX Reinforcement Learning Package
=====================================

Fixed-role self-play reinforcement learning system for the NovusX strategy game.

Key Design:
- AgentP0 ALWAYS plays as player 0
- AgentP1 ALWAYS plays as player 1
- Agents never swap roles or merge weights

Draw Detection:
- Maximum Turn Draw: turnCount >= 1000
- Repeated State Draw: Same state hash 10 times
- No-Progress Draw: 100 turns without capture AND unit death

Modules:
- env: Gym-style environment wrapper with draw detection
- model: Neural network architectures
- agent: PPO agent implementation  
- train_self_play: Fixed-role self-play training loop
- evaluate: Evaluation and tournament tools
"""

from .env import NovusXEnv, GameOutcome, DrawReason
from .agent import PPOAgent, create_agent
from .model import PolicyValueNetwork, ActorCritic
from .train_self_play import FixedRoleSelfPlayTrainer, CHECKPOINT_MILESTONES

__all__ = [
    "NovusXEnv",
    "GameOutcome",
    "DrawReason",
    "PPOAgent",
    "create_agent",
    "PolicyValueNetwork",
    "ActorCritic",
    "FixedRoleSelfPlayTrainer",
    "CHECKPOINT_MILESTONES",
]
