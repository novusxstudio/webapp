"""
Main training script for multi-agent self-play reinforcement learning.

This script trains 8 agents (A-H) using PPO with self-play.
Each iteration:
  1. Randomly pair two agents
  2. Play one game, collecting trajectories
  3. Update both agents with PPO

Usage:
    python train_multi_agent.py [--resume] [--iterations N] [--no-plots]
"""

import os
import sys
import signal
import random
import argparse
import time
from typing import List, Tuple, Optional
from datetime import datetime
from dataclasses import asdict

import torch
import numpy as np

from multi_agent_config import MultiAgentConfig
from multi_agent import Agent
from multi_agent_env import MultiAgentEnv, play_self_play_game
from multi_agent_utils import (
    save_checkpoint,
    save_training_state,
    load_training_state,
    find_latest_checkpoint,
    plot_training_progress,
    print_training_summary,
    compute_elo_ratings
)


# Global flag for graceful shutdown
SHUTDOWN_REQUESTED = False


def signal_handler(signum, frame):
    """Handle Ctrl+C for graceful shutdown."""
    global SHUTDOWN_REQUESTED
    if SHUTDOWN_REQUESTED:
        print("\n[!] Force shutdown requested. Exiting immediately.")
        sys.exit(1)
    print("\n[!] Shutdown requested. Finishing current iteration and saving...")
    SHUTDOWN_REQUESTED = True


def create_agents(config: MultiAgentConfig, device: torch.device) -> List[Agent]:
    """Create all agents according to config."""
    agents = []
    for agent_id in config.agent_ids:
        agent = Agent(
            agent_id=agent_id,
            config=config,
            device=device
        )
        agents.append(agent)
        print(f"[Init] Created Agent {agent_id}")
    return agents


def load_agents(
    agents: List[Agent],
    config: MultiAgentConfig,
    checkpoint_dir: str
) -> int:
    """
    Load agents from checkpoints if available.
    
    Returns:
        Starting iteration number
    """
    start_iteration = 0
    
    for agent in agents:
        checkpoint_path = find_latest_checkpoint(checkpoint_dir, agent.agent_id)
        if checkpoint_path:
            agent.load_checkpoint(checkpoint_path)
            print(f"[Load] Agent {agent.agent_id} loaded from {checkpoint_path}")
    
    # Load global training state
    state = load_training_state(checkpoint_dir)
    if state:
        start_iteration = state['iteration']
        print(f"[Load] Resuming from iteration {start_iteration}")
    
    return start_iteration


def select_agent_pair(agents: List[Agent], config: MultiAgentConfig) -> Tuple[Agent, Agent]:
    """
    Select two agents for self-play.
    
    Uses weighted random selection to give less-played agents more games.
    """
    # Simple random selection for now
    # Could be extended to prioritize underrepresented matchups
    agent1, agent2 = random.sample(agents, 2)
    return agent1, agent2


def train_step(
    agent1: Agent,
    agent2: Agent,
    env: MultiAgentEnv,
    config: MultiAgentConfig
) -> dict:
    """
    Run one training iteration:
    1. Play a game between agent1 and agent2
    2. Update both agents with collected trajectories
    
    Returns:
        Match result dictionary
    """
    # Play game and collect trajectories
    trajectory1, trajectory2, game_length, winner, draw_reason = play_self_play_game(
        agent1, agent2, env, config
    )
    
    # Determine rewards and draw status
    draw = winner is None
    if winner == 0:  # agent1 wins
        reward1 = config.reward_win
        reward2 = config.reward_loss
    elif winner == 1:  # agent2 wins
        reward1 = config.reward_loss
        reward2 = config.reward_win
    elif draw_reason == 'turn_limit':  # Turn limit draw
        reward1 = config.reward_draw_turn_limit
        reward2 = config.reward_draw_turn_limit
    else:  # Other draw (mutual destruction, etc.)
        reward1 = config.reward_draw_other
        reward2 = config.reward_draw_other
    
    # Update agents with PPO
    if len(trajectory1.get('actions', [])) > 0:
        metrics1 = agent1.update([trajectory1])
        result1 = 'draw' if draw else ('win' if winner == 0 else 'loss')
        agent1.stats.record_game(
            opponent_id=agent2.agent_id,
            result=result1,
            reward=reward1,
            episode_length=game_length,
            played_as_p0=True  # agent1 is always P0
        )
    else:
        metrics1 = {}
    
    if len(trajectory2.get('actions', [])) > 0:
        metrics2 = agent2.update([trajectory2])
        result2 = 'draw' if draw else ('win' if winner == 1 else 'loss')
        agent2.stats.record_game(
            opponent_id=agent1.agent_id,
            result=result2,
            reward=reward2,
            episode_length=game_length,
            played_as_p0=False  # agent2 is always P1
        )
    
    return {
        'agent1': agent1.agent_id,
        'agent2': agent2.agent_id,
        'winner': winner,
        'game_length': game_length,
        'draw': draw,
    }


def main():
    global SHUTDOWN_REQUESTED
    
    # Parse arguments
    parser = argparse.ArgumentParser(description="Multi-Agent Self-Play Training")
    parser.add_argument('--resume', action='store_true', help='Resume from checkpoint')
    parser.add_argument('--iterations', type=int, default=100000, help='Total iterations')
    parser.add_argument('--no-plots', action='store_true', help='Disable plot generation')
    parser.add_argument('--checkpoint-dir', type=str, default='checkpoints/multi_agent',
                       help='Checkpoint directory')
    parser.add_argument('--plot-dir', type=str, default='plots/multi_agent',
                       help='Plot output directory')
    parser.add_argument('--log-interval', type=int, default=100,
                       help='Logging interval')
    parser.add_argument('--device', type=str, default='auto',
                       help='Device (auto, cpu, cuda)')
    parser.add_argument('--seed', type=int, default=None, help='Random seed')
    args = parser.parse_args()
    
    # Setup signal handler
    signal.signal(signal.SIGINT, signal_handler)
    
    # Setup device
    if args.device == 'auto':
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        device = torch.device(args.device)
    print(f"[Init] Using device: {device}")
    
    # Setup seed
    if args.seed is not None:
        random.seed(args.seed)
        np.random.seed(args.seed)
        torch.manual_seed(args.seed)
        if device.type == 'cuda':
            torch.cuda.manual_seed(args.seed)
        print(f"[Init] Random seed: {args.seed}")
    
    # Create config
    config = MultiAgentConfig()
    
    # Create directories
    os.makedirs(args.checkpoint_dir, exist_ok=True)
    os.makedirs(args.plot_dir, exist_ok=True)
    
    # Create agents
    agents = create_agents(config, device)
    agent_dict = {a.agent_id: a for a in agents}
    
    # Create environment
    env = MultiAgentEnv(config)
    
    # Load checkpoints if resuming
    start_iteration = 0
    matchup_history = []
    
    # Global stats dict for saving
    global_stats = {
        'p0_wins': 0,
        'p0_losses': 0,
        'p0_draws': 0,
        'p1_wins': 0,
        'p1_losses': 0,
        'p1_draws': 0,
        'total_games': 0
    }
    
    if args.resume:
        start_iteration = load_agents(agents, config, args.checkpoint_dir)
        state = load_training_state(args.checkpoint_dir)
        if state:
            matchup_history = state.get('matchup_history', [])
            # Restore global stats
            saved_global = state.get('global_stats', {})
            if saved_global:
                global_stats.update(saved_global)
    
    print(f"\n[Training] Starting from iteration {start_iteration}")
    print(f"[Training] Target iterations: {args.iterations}")
    print(f"[Training] Agents: {config.agent_ids}")
    print("-" * 60)
    
    # Training metrics
    recent_games = []
    start_time = time.time()
    last_print_time = start_time
    
    # Track P0/P1 win counts (for in-memory display)
    p0_wins_total = global_stats.get('p0_wins', 0)
    p1_wins_total = global_stats.get('p1_wins', 0)
    draws_total = global_stats.get('p0_draws', 0)
    
    # Main training loop
    for iteration in range(start_iteration, args.iterations):
        if SHUTDOWN_REQUESTED:
            break
        
        # Select agent pair
        agent1, agent2 = select_agent_pair(agents, config)
        
        # Run training step
        result = train_step(agent1, agent2, env, config)
        
        # Update totals
        global_stats['total_games'] += 1
        if result['winner'] == 0:
            p0_wins_total += 1
            global_stats['p0_wins'] += 1
            global_stats['p1_losses'] += 1
        elif result['winner'] == 1:
            p1_wins_total += 1
            global_stats['p1_wins'] += 1
            global_stats['p0_losses'] += 1
        else:
            draws_total += 1
            global_stats['p0_draws'] += 1
            global_stats['p1_draws'] += 1
        
        # Record result
        matchup_history.append(result)
        recent_games.append(result)
        
        # Keep only recent games for metrics
        if len(recent_games) > 1000:
            recent_games = recent_games[-1000:]
        
        # Get agent win rates
        a1_wr = agent1.stats.win_rate * 100
        a2_wr = agent2.stats.win_rate * 100
        
        # Result string
        if result['winner'] == 0:
            result_str = f"P0 ({result['agent1']}) WINS"
        elif result['winner'] == 1:
            result_str = f"P1 ({result['agent2']}) WINS"
        else:
            result_str = "DRAW"
        
        # Progress bar and result display
        current_time = time.time()
        elapsed = current_time - start_time
        progress = (iteration - start_iteration + 1) / (args.iterations - start_iteration)
        bar_width = 20
        filled = int(bar_width * progress)
        bar = '█' * filled + '░' * (bar_width - filled)
        
        if iteration > start_iteration:
            games_per_sec = (iteration - start_iteration + 1) / elapsed
            eta = (args.iterations - iteration - 1) / games_per_sec if games_per_sec > 0 else 0
            eta_str = f"{int(eta//60)}m{int(eta%60):02d}s"
        else:
            games_per_sec = 0.0
            eta_str = "..."
        
        # P0:P1 ratio
        total_decided = p0_wins_total + p1_wins_total
        if total_decided > 0:
            p0_ratio = p0_wins_total / total_decided * 100
            p1_ratio = p1_wins_total / total_decided * 100
        else:
            p0_ratio = 50.0
            p1_ratio = 50.0
        
        # Print iteration result
        print(f"\r[{bar}] {progress*100:5.1f}% | #{iteration+1} | "
              f"P0:{result['agent1']} vs P1:{result['agent2']} | "
              f"T={result['game_length']:>3} | {result_str:<15} | "
              f"P0/P1: {p0_ratio:.0f}/{p1_ratio:.0f}% | "
              f"WR: {result['agent1']}={a1_wr:.0f}% {result['agent2']}={a2_wr:.0f}% | "
              f"{games_per_sec:.2f}g/s | ETA:{eta_str}   ")
        
        # Detailed logging at intervals
        if (iteration + 1) % args.log_interval == 0:
            # Compute recent stats
            recent_lengths = [g['game_length'] for g in recent_games]
            avg_length = np.mean(recent_lengths)
            
            recent_p0 = sum(1 for g in recent_games if g['winner'] == 0)
            recent_p1 = sum(1 for g in recent_games if g['winner'] == 1)
            recent_draws = sum(1 for g in recent_games if g['draw'])
            
            # Compute rates
            total_games = global_stats['total_games']
            if total_games > 0:
                p0_win_rate = global_stats['p0_wins'] / total_games * 100
                p0_loss_rate = global_stats['p0_losses'] / total_games * 100
                p0_draw_rate = global_stats['p0_draws'] / total_games * 100
                p1_win_rate = global_stats['p1_wins'] / total_games * 100
                p1_loss_rate = global_stats['p1_losses'] / total_games * 100
                p1_draw_rate = global_stats['p1_draws'] / total_games * 100
            else:
                p0_win_rate = p0_loss_rate = p0_draw_rate = 0
                p1_win_rate = p1_loss_rate = p1_draw_rate = 0
            
            print(f"\n{'═'*130}")
            print(f"  SUMMARY @ Iteration {iteration+1}")
            print(f"{'─'*130}")
            print(f"  Avg Game Length: {avg_length:.1f} turns | "
                  f"Recent {len(recent_games)} games: P0={recent_p0} P1={recent_p1} Draw={recent_draws}")
            print(f"{'─'*130}")
            print(f"  GLOBAL STATS (All-time):")
            print(f"    P0 (First Player): Wins={global_stats['p0_wins']:>5} ({p0_win_rate:5.1f}%) | "
                  f"Losses={global_stats['p0_losses']:>5} ({p0_loss_rate:5.1f}%) | "
                  f"Draws={global_stats['p0_draws']:>5} ({p0_draw_rate:5.1f}%)")
            print(f"    P1 (Second Player): Wins={global_stats['p1_wins']:>5} ({p1_win_rate:5.1f}%) | "
                  f"Losses={global_stats['p1_losses']:>5} ({p1_loss_rate:5.1f}%) | "
                  f"Draws={global_stats['p1_draws']:>5} ({p1_draw_rate:5.1f}%)")
            print(f"    Total Games: {total_games}")
            
            # Show all agent stats: games played and win rate
            print(f"{'─'*130}")
            print(f"  {'Agent':<6} {'Games':>6} {'Wins':>6} {'Loss':>6} {'Draw':>6} {'WinR':>6} {'LossR':>6} {'DrawR':>6}  Matchups (W-L-D)")
            print(f"{'─'*130}")
            for a in agents:
                s = a.stats
                # Build matchup string
                matchup_parts = []
                for opp_id in config.agent_ids:
                    if opp_id == a.agent_id:
                        continue
                    w = s.wins_vs.get(opp_id, 0)
                    l = s.losses_vs.get(opp_id, 0)
                    d = s.draws_vs.get(opp_id, 0)
                    total = w + l + d
                    if total > 0:
                        matchup_parts.append(f"{opp_id}:{w}-{l}-{d}")
                matchup_str = " ".join(matchup_parts) if matchup_parts else "No games yet"
                
                print(f"  {a.agent_id:<6} {s.total_episodes:>6} {s.wins:>6} {s.losses:>6} {s.draws:>6} "
                      f"{s.win_rate*100:>5.1f}% {s.loss_rate*100:>5.1f}% {s.draw_rate*100:>5.1f}%  {matchup_str}")
            print(f"{'═'*130}")
        
        # Update agent histories for plotting
        if (iteration + 1) % config.checkpoint_interval_small == 0:
            for agent in agents:
                agent.iteration_history.append(iteration + 1)
                agent.win_rate_history.append(agent.stats.win_rate)
                agent.avg_reward_history.append(agent.stats.avg_reward)
                agent.avg_length_history.append(agent.stats.avg_episode_length)
        
        # Checkpointing
        is_small = (iteration + 1) % config.checkpoint_interval_small == 0
        is_medium = (iteration + 1) % config.checkpoint_interval_medium == 0
        is_large = (iteration + 1) % config.checkpoint_interval_large == 0
        
        if is_small:
            for agent in agents:
                save_checkpoint(
                    agent, args.checkpoint_dir, iteration + 1,
                    is_small, is_medium, is_large
                )
            
            # Save training state
            agent_stats = {a.agent_id: a.stats.to_dict() for a in agents}
            save_training_state(
                args.checkpoint_dir, iteration + 1,
                agent_stats, matchup_history, global_stats
            )
        
        # Plot generation
        if is_medium and not args.no_plots:
            plot_training_progress(agents, args.plot_dir, iteration + 1, matchup_history)
        
        # Print summary
        if is_large:
            print_training_summary(agents, iteration + 1, matchup_history)
    
    # Final save
    print("\n[Shutdown] Saving final checkpoints...")
    final_iter = min(iteration + 1, args.iterations) if 'iteration' in dir() else start_iteration
    
    for agent in agents:
        save_checkpoint(agent, args.checkpoint_dir, final_iter, True, True, True)
    
    agent_stats = {a.agent_id: a.stats.to_dict() for a in agents}
    save_training_state(args.checkpoint_dir, final_iter, agent_stats, matchup_history, global_stats)
    
    if not args.no_plots:
        plot_training_progress(agents, args.plot_dir, final_iter, matchup_history)
    
    print_training_summary(agents, final_iter, matchup_history)
    
    # Final ELO report
    if len(matchup_history) > 0:
        elo_ratings = compute_elo_ratings(config.agent_ids, matchup_history)
        print("\nFinal ELO Rankings:")
        print("-" * 30)
        for i, (aid, elo) in enumerate(sorted(elo_ratings.items(), key=lambda x: x[1], reverse=True)):
            print(f"  {i+1}. Agent {aid}: {elo:.0f}")
    
    print(f"\n[Done] Training completed. Total iterations: {final_iter}")
    print(f"[Done] Checkpoints saved to: {args.checkpoint_dir}")
    print(f"[Done] Plots saved to: {args.plot_dir}")


if __name__ == '__main__':
    main()
