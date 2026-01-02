"""
Evaluation script for trained multi-agent models.

Run tournaments between trained agents, evaluate against random baseline,
and generate detailed statistics.

Usage:
    python evaluate_agents.py --checkpoint-dir checkpoints/multi_agent
    python evaluate_agents.py --tournament --games 100
    python evaluate_agents.py --vs-random --games 50
"""

import os
import sys
import argparse
import random
from typing import List, Dict, Tuple, Optional
from collections import defaultdict

import torch
import numpy as np

from multi_agent_config import MultiAgentConfig
from multi_agent import Agent
from multi_agent_env import MultiAgentEnv, play_self_play_game
from multi_agent_utils import (
    find_latest_checkpoint,
    compute_elo_ratings,
    plot_training_progress
)


class RandomAgent:
    """Random baseline agent for evaluation."""
    
    def __init__(self, agent_id: str = "Random"):
        self.agent_id = agent_id
        self.device = torch.device('cpu')
    
    def select_action(
        self,
        observation: torch.Tensor,
        action_mask: torch.Tensor
    ) -> Tuple[int, float, float]:
        """Select a random valid action."""
        valid_actions = torch.where(action_mask > 0)[0]
        if len(valid_actions) == 0:
            return 0, 0.0, 0.0
        
        action = random.choice(valid_actions.tolist())
        return action, 0.0, 0.0


def run_tournament(
    agents: List[Agent],
    env: MultiAgentEnv,
    games_per_pair: int = 10,
    max_turns: int = 200
) -> Dict:
    """
    Run a round-robin tournament between all agents.
    
    Args:
        agents: List of agents to evaluate
        env: Game environment
        games_per_pair: Number of games per agent pair
        max_turns: Maximum turns per game
    
    Returns:
        Tournament results dictionary
    """
    n_agents = len(agents)
    results = {
        'matchups': defaultdict(lambda: {'wins': 0, 'losses': 0, 'draws': 0, 'games': 0}),
        'total_stats': defaultdict(lambda: {'wins': 0, 'losses': 0, 'draws': 0, 'games': 0}),
        'match_history': []
    }
    
    total_games = n_agents * (n_agents - 1) * games_per_pair
    game_count = 0
    
    print(f"\n[Tournament] Running {total_games} games ({games_per_pair} per pair)")
    print("-" * 60)
    
    for i, agent1 in enumerate(agents):
        for j, agent2 in enumerate(agents):
            if i == j:
                continue
            
            matchup_key = f"{agent1.agent_id}_vs_{agent2.agent_id}"
            
            for game_num in range(games_per_pair):
                # Play game
                _, _, winner, game_length = play_self_play_game(
                    env, agent1, agent2, max_turns
                )
                
                game_count += 1
                
                # Record result
                match_result = {
                    'agent1': agent1.agent_id,
                    'agent2': agent2.agent_id,
                    'winner': winner,
                    'game_length': game_length
                }
                results['match_history'].append(match_result)
                
                # Update stats
                results['matchups'][matchup_key]['games'] += 1
                results['total_stats'][agent1.agent_id]['games'] += 1
                results['total_stats'][agent2.agent_id]['games'] += 1
                
                if winner == 0:  # agent1 wins
                    results['matchups'][matchup_key]['wins'] += 1
                    results['total_stats'][agent1.agent_id]['wins'] += 1
                    results['total_stats'][agent2.agent_id]['losses'] += 1
                elif winner == 1:  # agent2 wins
                    results['matchups'][matchup_key]['losses'] += 1
                    results['total_stats'][agent1.agent_id]['losses'] += 1
                    results['total_stats'][agent2.agent_id]['wins'] += 1
                else:  # draw
                    results['matchups'][matchup_key]['draws'] += 1
                    results['total_stats'][agent1.agent_id]['draws'] += 1
                    results['total_stats'][agent2.agent_id]['draws'] += 1
                
                # Progress update
                if game_count % 10 == 0:
                    print(f"  Progress: {game_count}/{total_games} games "
                          f"({100*game_count/total_games:.1f}%)", end='\r')
    
    print(f"\n[Tournament] Completed {total_games} games")
    
    return dict(results)


def run_vs_random(
    agents: List[Agent],
    env: MultiAgentEnv,
    games_per_agent: int = 50,
    max_turns: int = 200
) -> Dict:
    """
    Evaluate agents against random baseline.
    
    Args:
        agents: List of agents to evaluate
        env: Game environment
        games_per_agent: Number of games per agent
        max_turns: Maximum turns per game
    
    Returns:
        Evaluation results
    """
    random_agent = RandomAgent()
    results = {}
    
    print(f"\n[Eval] Testing {len(agents)} agents against random baseline")
    print("-" * 60)
    
    for agent in agents:
        wins, losses, draws = 0, 0, 0
        total_length = 0
        
        # Play as player 0
        for _ in range(games_per_agent // 2):
            _, _, winner, length = play_self_play_game(
                env, agent, random_agent, max_turns
            )
            total_length += length
            if winner == 0:
                wins += 1
            elif winner == 1:
                losses += 1
            else:
                draws += 1
        
        # Play as player 1
        for _ in range(games_per_agent // 2):
            _, _, winner, length = play_self_play_game(
                env, random_agent, agent, max_turns
            )
            total_length += length
            if winner == 1:  # agent is player 1
                wins += 1
            elif winner == 0:
                losses += 1
            else:
                draws += 1
        
        win_rate = wins / games_per_agent
        avg_length = total_length / games_per_agent
        
        results[agent.agent_id] = {
            'wins': wins,
            'losses': losses,
            'draws': draws,
            'win_rate': win_rate,
            'avg_length': avg_length
        }
        
        print(f"  Agent {agent.agent_id}: "
              f"{wins}W/{losses}L/{draws}D "
              f"(Win Rate: {win_rate:.1%}, Avg Length: {avg_length:.1f})")
    
    return results


def print_tournament_results(results: Dict, agents: List[Agent]):
    """Print formatted tournament results."""
    print("\n" + "=" * 70)
    print("TOURNAMENT RESULTS")
    print("=" * 70)
    
    # Overall standings
    agent_ids = [a.agent_id for a in agents]
    standings = []
    
    for aid in agent_ids:
        stats = results['total_stats'][aid]
        win_rate = stats['wins'] / max(stats['games'], 1)
        standings.append((aid, stats['wins'], stats['losses'], stats['draws'], win_rate))
    
    standings.sort(key=lambda x: x[4], reverse=True)
    
    print("\nOverall Standings:")
    print("-" * 60)
    print(f"{'Rank':<6} {'Agent':<10} {'Wins':<8} {'Losses':<8} {'Draws':<8} {'Win Rate':<10}")
    print("-" * 60)
    
    for rank, (aid, wins, losses, draws, wr) in enumerate(standings, 1):
        print(f"{rank:<6} Agent {aid:<4} {wins:<8} {losses:<8} {draws:<8} {wr:.1%}")
    
    # ELO ratings
    elo_ratings = compute_elo_ratings(agent_ids, results['match_history'])
    
    print("\nELO Ratings:")
    print("-" * 40)
    for aid, elo in sorted(elo_ratings.items(), key=lambda x: x[1], reverse=True):
        print(f"  Agent {aid}: {elo:.0f}")
    
    # Head-to-head matrix
    print("\nHead-to-Head Win Rates:")
    print("-" * 70)
    
    # Header
    header = "     "
    for aid in agent_ids:
        header += f"  vs {aid}  "
    print(header)
    print("-" * 70)
    
    for aid1 in agent_ids:
        row = f"  {aid1}  "
        for aid2 in agent_ids:
            if aid1 == aid2:
                row += "   -    "
            else:
                key = f"{aid1}_vs_{aid2}"
                stats = results['matchups'][key]
                if stats['games'] > 0:
                    wr = stats['wins'] / stats['games']
                    row += f"  {wr:.0%}   "
                else:
                    row += "   -    "
        print(row)
    
    print("=" * 70)


def main():
    parser = argparse.ArgumentParser(description="Evaluate Multi-Agent Models")
    parser.add_argument('--checkpoint-dir', type=str, default='checkpoints/multi_agent',
                       help='Checkpoint directory')
    parser.add_argument('--tournament', action='store_true',
                       help='Run round-robin tournament')
    parser.add_argument('--vs-random', action='store_true',
                       help='Evaluate against random baseline')
    parser.add_argument('--games', type=int, default=50,
                       help='Games per matchup (tournament) or per agent (vs-random)')
    parser.add_argument('--device', type=str, default='auto',
                       help='Device (auto, cpu, cuda)')
    parser.add_argument('--agents', type=str, nargs='*', default=None,
                       help='Specific agents to evaluate (e.g., A B C)')
    args = parser.parse_args()
    
    # Setup device
    if args.device == 'auto':
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        device = torch.device(args.device)
    print(f"[Init] Using device: {device}")
    
    # Create config
    config = MultiAgentConfig()
    
    # Determine which agents to load
    agent_ids = args.agents if args.agents else config.agent_ids
    
    # Load agents
    agents = []
    for agent_id in agent_ids:
        checkpoint_path = find_latest_checkpoint(args.checkpoint_dir, agent_id)
        if checkpoint_path:
            agent = Agent(agent_id, config, device)
            agent.load_checkpoint(checkpoint_path)
            agents.append(agent)
            print(f"[Load] Agent {agent_id} loaded from {checkpoint_path}")
        else:
            print(f"[Warning] No checkpoint found for Agent {agent_id}")
    
    if not agents:
        print("[Error] No agents loaded. Run training first.")
        sys.exit(1)
    
    print(f"\n[Eval] Loaded {len(agents)} agents: {[a.agent_id for a in agents]}")
    
    # Create environment
    env = MultiAgentEnv(config)
    
    # Run evaluations
    if args.tournament:
        results = run_tournament(agents, env, args.games)
        print_tournament_results(results, agents)
    
    if args.vs_random:
        results = run_vs_random(agents, env, args.games)
    
    if not args.tournament and not args.vs_random:
        print("\nNo evaluation mode specified. Use --tournament or --vs-random")
        print("Example: python evaluate_agents.py --tournament --games 100")


if __name__ == '__main__':
    main()
