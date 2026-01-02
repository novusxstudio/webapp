"""
Evaluation Module
=================

Tools for evaluating trained RL agents:
- Play against human players
- Play against built-in bots
- Play against older checkpoints
- Generate game statistics
"""

import os
import sys
import yaml
import json
import random
import numpy as np
import torch
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from collections import Counter

from .env import NovusXEnv
from .agent import PPOAgent, create_agent


@dataclass
class GameResult:
    """Result of a single game."""
    winner: Optional[int]  # 0, 1, or None for draw
    total_turns: int
    player_0_reward: float
    player_1_reward: float
    game_history: List[Dict]


class Evaluator:
    """
    Evaluation system for trained RL agents.
    """
    
    def __init__(self, config_path: str = "rl/config.yaml", device: str = "cpu"):
        """
        Initialize the evaluator.
        
        Args:
            config_path: Path to configuration file
            device: Device for models
        """
        self.device = device
        
        # Load config
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        # Create environment
        self.env = NovusXEnv(self.config.get("env", {}))
        
        # =========================================================
        # Disable training mode for evaluation
        # During evaluation/inference, all draws receive 0.0 reward
        # to ensure consistent game semantics with human play
        # =========================================================
        self.env.set_training_mode(training=False)
        
        self.observation_size = self.env.observation_size
        self.action_size = self.env.action_size
        
        # Agents dictionary
        self.agents: Dict[str, PPOAgent] = {}
    
    def load_agent(self, checkpoint_path: str, name: str = None) -> PPOAgent:
        """
        Load an agent from a checkpoint.
        
        Args:
            checkpoint_path: Path to the checkpoint file
            name: Name for the agent (default: filename)
            
        Returns:
            Loaded PPOAgent
        """
        if name is None:
            name = Path(checkpoint_path).stem
        
        agent = create_agent(
            self.observation_size, 
            self.action_size, 
            self.config, 
            self.device, 
            name
        )
        agent.load_checkpoint(checkpoint_path)
        self.agents[name] = agent
        
        print(f"Loaded agent '{name}' from {checkpoint_path}")
        print(f"  ELO: {agent.elo_rating:.1f}")
        
        return agent
    
    def play_game(
        self, 
        player_0, 
        player_1,
        render: bool = False,
        verbose: bool = False
    ) -> GameResult:
        """
        Play a single game between two players.
        
        Args:
            player_0: Agent or "human" or "random"
            player_1: Agent or "human" or "random"
            render: Whether to render the game
            verbose: Whether to print game progress
            
        Returns:
            GameResult with game outcome
        """
        obs = self.env.reset()
        
        players = [player_0, player_1]
        rewards = [0.0, 0.0]
        game_history = []
        done = False
        turn = 0
        
        while not done:
            current_player = self.env.state.current_player
            player = players[current_player]
            
            # Get observation
            observation = self.env._get_observation(current_player)
            action_mask = self.env.get_valid_actions_mask(current_player)
            
            # Select action based on player type
            if player == "human":
                action = self._get_human_action(current_player, action_mask)
            elif player == "random":
                valid_actions = np.where(action_mask)[0]
                action = np.random.choice(valid_actions)
            else:
                # Agent
                action, _, _ = player.select_action(
                    observation, action_mask, deterministic=True
                )
            
            # Decode action for logging
            action_info = self.env._decode_action(action)
            
            if verbose:
                print(f"Turn {turn+1}, Player {current_player}: {action_info}")
            
            # Take step
            next_obs, reward, done, info = self.env.step(action, current_player)
            
            rewards[current_player] += reward
            
            # Record history
            game_history.append({
                "turn": turn,
                "player": current_player,
                "action": action,
                "action_info": action_info,
                "reward": reward,
            })
            
            if render:
                self._render_game()
            
            turn += 1
        
        winner = info.get("winner")
        
        if verbose:
            if winner is not None:
                print(f"\nGame Over! Player {winner} wins!")
            else:
                print("\nGame Over! Draw!")
            print(f"Player 0 reward: {rewards[0]:.2f}")
            print(f"Player 1 reward: {rewards[1]:.2f}")
        
        return GameResult(
            winner=winner,
            total_turns=turn,
            player_0_reward=rewards[0],
            player_1_reward=rewards[1],
            game_history=game_history
        )
    
    def _get_human_action(self, player: int, action_mask: np.ndarray) -> int:
        """Get action from human player via command line."""
        valid_actions = np.where(action_mask)[0]
        
        print(f"\n=== Player {player}'s Turn ===")
        self._render_game()
        
        print("\nValid actions:")
        for i, action_idx in enumerate(valid_actions[:20]):  # Show first 20
            action_info = self.env._decode_action(action_idx)
            print(f"  {action_idx}: {action_info}")
        
        if len(valid_actions) > 20:
            print(f"  ... and {len(valid_actions) - 20} more")
        
        while True:
            try:
                action = int(input("\nEnter action number: "))
                if action in valid_actions:
                    return action
                print("Invalid action! Try again.")
            except ValueError:
                print("Please enter a number.")
    
    def _render_game(self):
        """Render the current game state."""
        state = self.env.state
        
        print("\n  0 1 2 3 4")
        print("  ---------")
        for y in range(5):
            row = f"{y}|"
            for x in range(5):
                unit = state.get_unit_at(x, y)
                if unit:
                    # Show unit type abbreviation and owner
                    abbrev = unit.unit_type[0].upper()
                    owner = unit.owner
                    row += f"{abbrev}{owner}"
                else:
                    row += ". "
            print(row)
        
        print(f"\nPlayer 0 - HP: {state.players[0]['hp']}, Deploy: {state.players[0].get('deploymentsRemaining', 0)}")
        print(f"Player 1 - HP: {state.players[1]['hp']}, Deploy: {state.players[1].get('deploymentsRemaining', 0)}")
    
    def evaluate_agents(
        self,
        agent_a,
        agent_b,
        num_games: int = 100,
        verbose: bool = False
    ) -> Dict:
        """
        Evaluate two agents against each other over multiple games.
        
        Args:
            agent_a: First agent (or "random")
            agent_b: Second agent (or "random")
            num_games: Number of games to play
            verbose: Print progress
            
        Returns:
            Dictionary of evaluation statistics
        """
        results = []
        
        for game_num in range(num_games):
            # Alternate who goes first
            if game_num % 2 == 0:
                result = self.play_game(agent_a, agent_b)
                # Adjust winner to be from agent_a's perspective
                if result.winner == 0:
                    a_result = "win"
                elif result.winner == 1:
                    a_result = "loss"
                else:
                    a_result = "draw"
            else:
                result = self.play_game(agent_b, agent_a)
                # agent_a is player 1 in this case
                if result.winner == 1:
                    a_result = "win"
                elif result.winner == 0:
                    a_result = "loss"
                else:
                    a_result = "draw"
            
            results.append({
                "game": game_num,
                "a_result": a_result,
                "turns": result.total_turns,
            })
            
            if verbose and (game_num + 1) % 10 == 0:
                wins = sum(1 for r in results if r["a_result"] == "win")
                print(f"Games: {game_num + 1}, A wins: {wins}/{game_num + 1}")
        
        # Calculate statistics
        outcome_counts = Counter(r["a_result"] for r in results)
        win_rate = outcome_counts["win"] / num_games
        draw_rate = outcome_counts["draw"] / num_games
        avg_turns = np.mean([r["turns"] for r in results])
        
        return {
            "num_games": num_games,
            "wins": outcome_counts["win"],
            "losses": outcome_counts["loss"],
            "draws": outcome_counts["draw"],
            "win_rate": win_rate,
            "draw_rate": draw_rate,
            "avg_turns": avg_turns,
            "results": results
        }
    
    def compare_checkpoints(
        self,
        checkpoint_paths: List[str],
        num_games_per_pair: int = 50
    ) -> Dict:
        """
        Compare multiple checkpoints against each other.
        
        Args:
            checkpoint_paths: List of checkpoint paths
            num_games_per_pair: Games to play between each pair
            
        Returns:
            Comparison results with win matrices
        """
        # Load all agents
        agents = []
        for path in checkpoint_paths:
            agent = self.load_agent(path)
            agents.append((path, agent))
        
        n = len(agents)
        win_matrix = np.zeros((n, n))
        
        for i in range(n):
            for j in range(i + 1, n):
                print(f"\nComparing {Path(checkpoint_paths[i]).stem} vs {Path(checkpoint_paths[j]).stem}")
                
                results = self.evaluate_agents(
                    agents[i][1], 
                    agents[j][1], 
                    num_games_per_pair,
                    verbose=True
                )
                
                win_matrix[i, j] = results["win_rate"]
                win_matrix[j, i] = 1 - results["win_rate"]
        
        # Calculate overall rankings (average win rate)
        rankings = []
        for i in range(n):
            avg_win_rate = np.mean([win_matrix[i, j] for j in range(n) if i != j])
            rankings.append((checkpoint_paths[i], avg_win_rate))
        
        rankings.sort(key=lambda x: x[1], reverse=True)
        
        return {
            "checkpoints": checkpoint_paths,
            "win_matrix": win_matrix.tolist(),
            "rankings": rankings
        }
    
    def play_vs_human(self, checkpoint_path: str, human_first: bool = True):
        """
        Play a game against a human player.
        
        Args:
            checkpoint_path: Path to agent checkpoint
            human_first: Whether human plays first
        """
        agent = self.load_agent(checkpoint_path, "AI_Opponent")
        
        if human_first:
            result = self.play_game("human", agent, render=True, verbose=True)
            human_player = 0
        else:
            result = self.play_game(agent, "human", render=True, verbose=True)
            human_player = 1
        
        if result.winner == human_player:
            print("\n🎉 Congratulations! You won!")
        elif result.winner is not None:
            print("\n🤖 The AI wins!")
        else:
            print("\n🤝 It's a draw!")


class TournamentRunner:
    """Run round-robin tournaments between agents."""
    
    def __init__(self, evaluator: Evaluator):
        self.evaluator = evaluator
    
    def round_robin(
        self, 
        agent_names: List[str], 
        games_per_match: int = 20
    ) -> Dict:
        """
        Run a round-robin tournament.
        
        Args:
            agent_names: Names of agents (must be loaded in evaluator)
            games_per_match: Games per matchup
            
        Returns:
            Tournament results
        """
        n = len(agent_names)
        points = {name: 0 for name in agent_names}
        results_matrix = {name: {other: None for other in agent_names} for name in agent_names}
        
        for i in range(n):
            for j in range(i + 1, n):
                agent_a = self.evaluator.agents[agent_names[i]]
                agent_b = self.evaluator.agents[agent_names[j]]
                
                print(f"\n{agent_names[i]} vs {agent_names[j]}")
                
                result = self.evaluator.evaluate_agents(
                    agent_a, agent_b, games_per_match, verbose=True
                )
                
                # Award points (3 for win, 1 for draw)
                points[agent_names[i]] += 3 * result["wins"] + result["draws"]
                points[agent_names[j]] += 3 * result["losses"] + result["draws"]
                
                results_matrix[agent_names[i]][agent_names[j]] = result["win_rate"]
                results_matrix[agent_names[j]][agent_names[i]] = 1 - result["win_rate"]
        
        # Sort by points
        standings = sorted(points.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "standings": standings,
            "points": points,
            "results_matrix": results_matrix
        }


def main():
    """Main entry point for evaluation."""
    import argparse
    
    parser = argparse.ArgumentParser(description="RL Agent Evaluation")
    parser.add_argument(
        "--config",
        type=str,
        default="rl/config.yaml",
        help="Path to configuration file"
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["human", "compare", "random", "tournament"],
        default="compare",
        help="Evaluation mode"
    )
    parser.add_argument(
        "--checkpoint",
        type=str,
        default=None,
        help="Path to agent checkpoint (for human mode)"
    )
    parser.add_argument(
        "--checkpoints",
        type=str,
        nargs="+",
        default=None,
        help="Paths to checkpoints (for compare mode)"
    )
    parser.add_argument(
        "--num_games",
        type=int,
        default=100,
        help="Number of games for evaluation"
    )
    parser.add_argument(
        "--device",
        type=str,
        default="cpu",
        help="Device to use"
    )
    
    args = parser.parse_args()
    
    evaluator = Evaluator(args.config, args.device)
    
    if args.mode == "human":
        if args.checkpoint is None:
            print("Error: --checkpoint required for human mode")
            return
        evaluator.play_vs_human(args.checkpoint)
    
    elif args.mode == "compare":
        if args.checkpoints is None or len(args.checkpoints) < 2:
            print("Error: --checkpoints requires at least 2 paths")
            return
        
        results = evaluator.compare_checkpoints(args.checkpoints, args.num_games)
        
        print("\n" + "=" * 50)
        print("RANKINGS")
        print("=" * 50)
        for i, (path, win_rate) in enumerate(results["rankings"]):
            print(f"{i+1}. {Path(path).stem}: {win_rate:.1%} avg win rate")
    
    elif args.mode == "random":
        if args.checkpoint is None:
            print("Error: --checkpoint required for random mode")
            return
        
        agent = evaluator.load_agent(args.checkpoint)
        results = evaluator.evaluate_agents(agent, "random", args.num_games, verbose=True)
        
        print("\n" + "=" * 50)
        print(f"Agent vs Random: {results['win_rate']:.1%} win rate")
        print(f"Average game length: {results['avg_turns']:.1f} turns")
    
    elif args.mode == "tournament":
        if args.checkpoints is None or len(args.checkpoints) < 2:
            print("Error: --checkpoints requires at least 2 paths")
            return
        
        # Load all agents
        for path in args.checkpoints:
            evaluator.load_agent(path)
        
        runner = TournamentRunner(evaluator)
        agent_names = list(evaluator.agents.keys())
        results = runner.round_robin(agent_names, args.num_games)
        
        print("\n" + "=" * 50)
        print("FINAL STANDINGS")
        print("=" * 50)
        for i, (name, pts) in enumerate(results["standings"]):
            print(f"{i+1}. {name}: {pts} points")


if __name__ == "__main__":
    main()
