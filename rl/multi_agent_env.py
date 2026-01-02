"""
Environment wrapper for multi-agent self-play.
Handles observation encoding and action decoding.
"""

import numpy as np
from typing import Tuple, Dict, List, Optional, Any
from dataclasses import dataclass
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from multi_agent_config import (
    GRID_SIZE, 
    NUM_UNIT_TYPES, 
    UNIT_TYPES, 
    ACTION_SPACE_SIZE,
    OBS_CHANNELS,
    GLOBAL_FEATURES,
    MultiAgentConfig
)


# Import game logic
try:
    from env import NovusXEnv, GameState
except ImportError:
    # Fallback - create minimal game state
    pass


@dataclass
class ActionInfo:
    """Information about a decoded action."""
    action_type: str  # 'end_turn', 'deploy', 'move', 'rotate', 'attack'
    unit_type: Optional[str] = None
    source_pos: Optional[Tuple[int, int]] = None
    target_pos: Optional[Tuple[int, int]] = None


class MultiAgentEnv:
    """
    Environment wrapper for multi-agent self-play.
    Provides observation encoding and action space management.
    """
    
    def __init__(self, config: MultiAgentConfig):
        self.config = config
        self.max_turns = config.max_turns
        
        # Action space layout:
        # 0: End turn
        # 1-30: Deploy (6 unit types * 5 columns)
        # 31-130: Move (25 source tiles * 4 directions)
        # 131-230: Rotate (25 source tiles * 4 directions)
        # 231-630: Attack (25 source tiles * 8 directions * 2 range levels)
        
        self.action_end_turn = 0
        self.action_deploy_start = 1
        self.action_deploy_end = 30
        self.action_move_start = 31
        self.action_move_end = 130
        self.action_rotate_start = 131
        self.action_rotate_end = 230
        self.action_attack_start = 231
        self.action_attack_end = 630
        
        # Direction offsets (up, right, down, left)
        self.directions_4 = [(-1, 0), (0, 1), (1, 0), (0, -1)]
        # 8 directions including diagonals
        self.directions_8 = [
            (-1, 0), (-1, 1), (0, 1), (1, 1),
            (1, 0), (1, -1), (0, -1), (-1, -1)
        ]
        
        # Initialize game state
        self.reset()
    
    def reset(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Reset the environment.
        
        Returns:
            board_state: (channels, 5, 5)
            global_features: (global_features,)
            action_mask: (action_space_size,)
        """
        self.game_state = self._create_initial_state()
        self.turn_count = 0
        self.done = False
        self.winner = None
        self.draw_reason = None
        
        return self._get_observation()
    
    def _create_initial_state(self) -> Dict:
        """Create initial game state."""
        # 5x5 grid, each cell can have a unit or be empty
        grid = [[None for _ in range(GRID_SIZE)] for _ in range(GRID_SIZE)]
        
        # Control points at row 3 (index 2), columns 1, 3, 5 (indices 0, 2, 4)
        control_points = [(2, 0), (2, 2), (2, 4)]
        
        # Players
        players = [
            {
                'id': 0,
                'deployments_remaining': 10,
                'deployment_counts': {ut: 0 for ut in UNIT_TYPES},
                'actions_remaining': 1
            },
            {
                'id': 1,
                'deployments_remaining': 10,
                'deployment_counts': {ut: 0 for ut in UNIT_TYPES},
                'actions_remaining': 0
            }
        ]
        
        return {
            'grid': grid,
            'control_points': control_points,
            'players': players,
            'current_player': 0,
            'turn_number': 1,
            'free_deployments': 0,
            'has_acted': False
        }
    
    def _get_observation(self) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Get current observation from the perspective of the current player.
        
        Returns:
            board_state: (channels, 5, 5) - One-hot encoded board
            global_features: (global_features,) - Scalar features
            action_mask: (action_space_size,) - Valid actions mask
        """
        current_player = self.game_state['current_player']
        opponent = 1 - current_player
        
        # Board state encoding
        # Channels: 6 own units + 6 opponent units + 1 empty + 1 control point = 14
        board_state = np.zeros((OBS_CHANNELS, GRID_SIZE, GRID_SIZE), dtype=np.float32)
        
        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                unit = self.game_state['grid'][row][col]
                if unit is None:
                    board_state[12, row, col] = 1.0  # Empty channel
                else:
                    unit_type_idx = UNIT_TYPES.index(unit['type'])
                    if unit['owner'] == current_player:
                        board_state[unit_type_idx, row, col] = 1.0
                    else:
                        board_state[6 + unit_type_idx, row, col] = 1.0
                
                # Control point channel
                if (row, col) in self.game_state['control_points']:
                    board_state[13, row, col] = 1.0
        
        # Global features
        own_player = self.game_state['players'][current_player]
        opp_player = self.game_state['players'][opponent]
        
        global_features = np.zeros(GLOBAL_FEATURES, dtype=np.float32)
        
        # Own deployments remaining (normalized)
        global_features[0] = own_player['deployments_remaining'] / 10.0
        
        # Own deployment counts per unit type
        for i, ut in enumerate(UNIT_TYPES):
            global_features[1 + i] = own_player['deployment_counts'][ut] / 2.0
        
        # Opponent deployments remaining
        global_features[7] = opp_player['deployments_remaining'] / 10.0
        
        # Opponent deployment counts per unit type
        for i, ut in enumerate(UNIT_TYPES):
            global_features[8 + i] = opp_player['deployment_counts'][ut] / 2.0
        
        # Turn info
        global_features[14] = self.game_state['turn_number'] / self.max_turns
        global_features[15] = own_player['actions_remaining'] / 2.0
        global_features[16] = self.game_state['free_deployments'] / 2.0
        global_features[17] = 1.0 if self.game_state['has_acted'] else 0.0
        
        # Control point control
        own_control = sum(1 for cp in self.game_state['control_points'] 
                         if self._controls_position(current_player, cp))
        opp_control = sum(1 for cp in self.game_state['control_points']
                         if self._controls_position(opponent, cp))
        global_features[18] = own_control / 3.0
        global_features[19] = opp_control / 3.0
        
        # Action mask
        action_mask = self._compute_action_mask()
        
        return board_state, global_features, action_mask
    
    def _controls_position(self, player_id: int, pos: Tuple[int, int]) -> bool:
        """Check if player has a unit on position."""
        unit = self.game_state['grid'][pos[0]][pos[1]]
        return unit is not None and unit['owner'] == player_id
    
    def _compute_action_mask(self) -> np.ndarray:
        """Compute valid action mask."""
        mask = np.zeros(ACTION_SPACE_SIZE, dtype=np.float32)
        
        current_player = self.game_state['current_player']
        player = self.game_state['players'][current_player]
        
        # End turn is always valid
        mask[self.action_end_turn] = 1.0
        
        # Check if player has actions
        if player['actions_remaining'] <= 0:
            return mask
        
        # Deploy actions - only limited by per-type limit (2 of each)
        deploy_row = 0 if current_player == 0 else 4
        for unit_idx, unit_type in enumerate(UNIT_TYPES):
            if player['deployment_counts'][unit_type] < 2:
                for col in range(GRID_SIZE):
                    if self.game_state['grid'][deploy_row][col] is None:
                        action_idx = self.action_deploy_start + unit_idx * 5 + col
                        mask[action_idx] = 1.0
        
        # Move, Rotate, Attack actions
        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                unit = self.game_state['grid'][row][col]
                if unit is None or unit['owner'] != current_player:
                    continue
                if unit.get('acted', False):
                    continue
                
                source_idx = row * GRID_SIZE + col
                unit_type = unit['type']
                move_range = self._get_move_range(unit_type)
                attack_range = self._get_attack_range(unit_type)
                
                # Move actions
                for dir_idx, (dr, dc) in enumerate(self.directions_4):
                    for dist in range(1, move_range + 1):
                        nr, nc = row + dr * dist, col + dc * dist
                        if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                            if self._can_move_to(row, col, nr, nc, dist):
                                action_idx = self.action_move_start + source_idx * 4 + dir_idx
                                mask[action_idx] = 1.0
                
                # Rotate actions (swap with adjacent friendly unit of different type)
                for dir_idx, (dr, dc) in enumerate(self.directions_4):
                    nr, nc = row + dr, col + dc
                    if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                        target_unit = self.game_state['grid'][nr][nc]
                        if (target_unit is not None and 
                            target_unit['owner'] == current_player and
                            target_unit['type'] != unit_type):
                            action_idx = self.action_rotate_start + source_idx * 4 + dir_idx
                            mask[action_idx] = 1.0
                
                # Attack actions
                for dir_idx, (dr, dc) in enumerate(self.directions_8):
                    for dist in range(1, attack_range + 1):
                        nr, nc = row + dr * dist, col + dc * dist
                        if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                            target_unit = self.game_state['grid'][nr][nc]
                            if target_unit is not None and target_unit['owner'] != current_player:
                                if self._can_attack(unit, target_unit, dist):
                                    action_idx = (self.action_attack_start + 
                                                 source_idx * 16 + dir_idx * 2 + (dist - 1))
                                    mask[action_idx] = 1.0
        
        return mask
    
    def _get_move_range(self, unit_type: str) -> int:
        """Get movement range for unit type."""
        return 2 if unit_type == 'cavalry' else 1
    
    def _get_attack_range(self, unit_type: str) -> int:
        """Get attack range for unit type."""
        if unit_type in ['archer', 'spearman']:
            return 2
        return 1
    
    def _can_move_to(self, sr: int, sc: int, tr: int, tc: int, dist: int) -> bool:
        """Check if unit can move to target position."""
        if self.game_state['grid'][tr][tc] is not None:
            return False
        
        # Check path is clear for distance > 1
        if dist > 1:
            dr = 1 if tr > sr else (-1 if tr < sr else 0)
            dc = 1 if tc > sc else (-1 if tc < sc else 0)
            r, c = sr + dr, sc + dc
            while (r, c) != (tr, tc):
                if self.game_state['grid'][r][c] is not None:
                    return False
                r, c = r + dr, c + dc
        
        return True
    
    def _can_attack(self, attacker: Dict, defender: Dict, distance: int) -> bool:
        """Check if attacker can attack defender."""
        a_type = attacker['type']
        d_type = defender['type']
        
        # Melee combat (distance 1)
        if distance == 1:
            melee_beats = {
                'swordsman': ['archer', 'cavalry', 'axeman', 'swordsman', 'spearman'],
                'shieldman': ['archer'],
                'axeman': ['archer', 'shieldman', 'cavalry', 'axeman', 'spearman'],
                'cavalry': ['archer', 'cavalry', 'spearman'],
                'archer': ['archer'],
                'spearman': ['archer', 'shieldman', 'cavalry', 'spearman']
            }
            a_beats = melee_beats.get(a_type, [])
            # Attacker must be able to defeat defender to initiate attack
            return d_type in a_beats
        
        # Ranged combat (distance 2)
        if a_type == 'archer':
            ranged_beats = ['archer', 'cavalry', 'axeman', 'swordsman', 'spearman']
            return d_type in ranged_beats
        elif a_type == 'spearman':
            ranged_beats = ['archer', 'cavalry', 'spearman']
            return d_type in ranged_beats
        
        return False
    
    def step(self, action: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray, float, bool, Dict]:
        """
        Execute an action.
        
        Returns:
            board_state, global_features, action_mask, reward, done, info
        """
        # VALIDATE: Action MUST be legal - this should NEVER fail with proper masking
        current_mask = self._compute_action_mask()
        if current_mask[action] == 0:
            raise ValueError(
                f"ILLEGAL ACTION ATTEMPTED: action={action} is not valid in current state. "
                f"This indicates a bug in action masking! "
                f"Current player: {self.game_state['current_player']}, "
                f"Turn: {self.game_state['turn_number']}"
            )
        
        current_player = self.game_state['current_player']
        player = self.game_state['players'][current_player]
        
        reward = 0.0
        info = {'action_type': 'unknown'}
        
        # Decode and execute action
        if action == self.action_end_turn:
            self._end_turn()
            info['action_type'] = 'end_turn'
        
        elif self.action_deploy_start <= action <= self.action_deploy_end:
            # Deploy action
            action_offset = action - self.action_deploy_start
            unit_idx = action_offset // 5
            col = action_offset % 5
            unit_type = UNIT_TYPES[unit_idx]
            deploy_row = 0 if current_player == 0 else 4
            
            self._deploy_unit(unit_type, deploy_row, col)
            info['action_type'] = 'deploy'
            info['unit_type'] = unit_type
        
        elif self.action_move_start <= action <= self.action_move_end:
            # Move action
            action_offset = action - self.action_move_start
            source_idx = action_offset // 4
            dir_idx = action_offset % 4
            
            sr, sc = source_idx // GRID_SIZE, source_idx % GRID_SIZE
            dr, dc = self.directions_4[dir_idx]
            
            unit = self.game_state['grid'][sr][sc]
            move_range = self._get_move_range(unit['type']) if unit else 1
            
            # Find furthest valid move in direction
            tr, tc = sr, sc
            for dist in range(1, move_range + 1):
                nr, nc = sr + dr * dist, sc + dc * dist
                if 0 <= nr < GRID_SIZE and 0 <= nc < GRID_SIZE:
                    if self.game_state['grid'][nr][nc] is None:
                        tr, tc = nr, nc
                    else:
                        break
            
            self._move_unit(sr, sc, tr, tc)
            info['action_type'] = 'move'
        
        elif self.action_rotate_start <= action <= self.action_rotate_end:
            # Rotate action
            action_offset = action - self.action_rotate_start
            source_idx = action_offset // 4
            dir_idx = action_offset % 4
            
            sr, sc = source_idx // GRID_SIZE, source_idx % GRID_SIZE
            dr, dc = self.directions_4[dir_idx]
            tr, tc = sr + dr, sc + dc
            
            self._rotate_units(sr, sc, tr, tc)
            info['action_type'] = 'rotate'
        
        elif self.action_attack_start <= action <= self.action_attack_end:
            # Attack action
            action_offset = action - self.action_attack_start
            source_idx = action_offset // 16
            dir_dist = action_offset % 16
            dir_idx = dir_dist // 2
            dist = (dir_dist % 2) + 1
            
            sr, sc = source_idx // GRID_SIZE, source_idx % GRID_SIZE
            dr, dc = self.directions_8[dir_idx]
            tr, tc = sr + dr * dist, sc + dc * dist
            
            self._attack(sr, sc, tr, tc)
            info['action_type'] = 'attack'
        
        # Check game end conditions
        self._check_game_end()
        
        # Get new observation
        board_state, global_features, action_mask = self._get_observation()
        
        # Compute reward if game ended
        if self.done:
            if self.winner == current_player:
                reward = self.config.reward_win
            elif self.winner == 1 - current_player:
                reward = self.config.reward_loss
            elif self.draw_reason == 'turn_limit':
                reward = self.config.reward_draw_turn_limit
            else:
                reward = self.config.reward_draw_other
        
        info['winner'] = self.winner
        info['draw_reason'] = self.draw_reason
        
        return board_state, global_features, action_mask, reward, self.done, info
    
    def _deploy_unit(self, unit_type: str, row: int, col: int):
        """Deploy a unit."""
        current_player = self.game_state['current_player']
        player = self.game_state['players'][current_player]
        
        self.game_state['grid'][row][col] = {
            'type': unit_type,
            'owner': current_player,
            'acted': True
        }
        
        # Consume free deployment if available
        if self.game_state['free_deployments'] > 0:
            self.game_state['free_deployments'] -= 1
        
        player['deployment_counts'][unit_type] += 1
        player['actions_remaining'] -= 1
        self.game_state['has_acted'] = True
    
    def _move_unit(self, sr: int, sc: int, tr: int, tc: int):
        """Move a unit."""
        unit = self.game_state['grid'][sr][sc]
        unit['acted'] = True
        self.game_state['grid'][tr][tc] = unit
        self.game_state['grid'][sr][sc] = None
        
        player = self.game_state['players'][self.game_state['current_player']]
        player['actions_remaining'] -= 1
        self.game_state['has_acted'] = True
    
    def _rotate_units(self, sr: int, sc: int, tr: int, tc: int):
        """Swap two units."""
        unit1 = self.game_state['grid'][sr][sc]
        unit2 = self.game_state['grid'][tr][tc]
        
        unit1['acted'] = True
        self.game_state['grid'][sr][sc] = unit2
        self.game_state['grid'][tr][tc] = unit1
        
        player = self.game_state['players'][self.game_state['current_player']]
        player['actions_remaining'] -= 1
        self.game_state['has_acted'] = True
    
    def _attack(self, sr: int, sc: int, tr: int, tc: int):
        """Execute attack."""
        attacker = self.game_state['grid'][sr][sc]
        defender = self.game_state['grid'][tr][tc]
        
        distance = abs(tr - sr) + abs(tc - sc)
        a_type = attacker['type']
        d_type = defender['type']
        
        # Determine combat outcome
        attacker_dies = False
        defender_dies = False
        
        # Melee combat tables
        melee_beats = {
            'swordsman': ['archer', 'cavalry', 'axeman', 'swordsman', 'spearman'],
            'shieldman': ['archer'],
            'axeman': ['archer', 'shieldman', 'cavalry', 'axeman', 'spearman'],
            'cavalry': ['archer', 'cavalry', 'spearman'],
            'archer': ['archer'],
            'spearman': ['archer', 'shieldman', 'cavalry', 'spearman']
        }
        
        # Ranged combat tables
        ranged_beats = {
            'archer': ['archer', 'cavalry', 'axeman', 'swordsman', 'spearman'],
            'spearman': ['archer', 'cavalry', 'spearman']
        }
        
        if distance == 1:
            # Melee combat - check both directions
            if d_type in melee_beats.get(a_type, []):
                defender_dies = True
            if a_type in melee_beats.get(d_type, []):
                attacker_dies = True
        else:
            # Ranged combat - check both directions
            if d_type in ranged_beats.get(a_type, []):
                defender_dies = True
            if a_type in ranged_beats.get(d_type, []):
                attacker_dies = True
        
        attacker['acted'] = True
        
        if attacker_dies:
            self.game_state['grid'][sr][sc] = None
        if defender_dies:
            self.game_state['grid'][tr][tc] = None
        
        player = self.game_state['players'][self.game_state['current_player']]
        player['actions_remaining'] -= 1
        self.game_state['has_acted'] = True
    
    def _end_turn(self):
        """End current player's turn."""
        current = self.game_state['current_player']
        next_player = 1 - current
        
        # Reset unit acted flags
        for row in range(GRID_SIZE):
            for col in range(GRID_SIZE):
                unit = self.game_state['grid'][row][col]
                if unit is not None:
                    unit['acted'] = False
        
        # Compute control point bonuses for next player
        controls_left = self._controls_position(next_player, (2, 0))
        controls_center = self._controls_position(next_player, (2, 2))
        controls_right = self._controls_position(next_player, (2, 4))
        
        controls_both_sides = controls_left and controls_right
        
        # Actions: base 1, +1 for center or both sides
        actions = 1
        if controls_center or controls_both_sides:
            actions = 2
        
        # Free deployment for controlling a side
        free_deploys = 1 if (controls_left or controls_right) else 0
        
        self.game_state['current_player'] = next_player
        self.game_state['players'][next_player]['actions_remaining'] = actions
        self.game_state['free_deployments'] = free_deploys
        self.game_state['turn_number'] += 1
        self.game_state['has_acted'] = False
        self.turn_count += 1
    
    def _check_game_end(self):
        """Check if game has ended."""
        # Victory by control
        for player_id in [0, 1]:
            if all(self._controls_position(player_id, cp) 
                   for cp in self.game_state['control_points']):
                self.done = True
                self.winner = player_id
                return
        
        # Victory by elimination
        for player_id in [0, 1]:
            player = self.game_state['players'][player_id]
            units_on_board = sum(
                1 for row in self.game_state['grid'] 
                for unit in row 
                if unit is not None and unit['owner'] == player_id
            )
            if units_on_board == 0 and player['deployments_remaining'] == 0:
                self.done = True
                self.winner = 1 - player_id
                return
        
        # Draw by turn limit
        if self.game_state['turn_number'] >= self.max_turns:
            self.done = True
            self.winner = None
            self.draw_reason = 'turn_limit'
            return
        
        # Draw by low resources
        total_resources = []
        for player_id in [0, 1]:
            player = self.game_state['players'][player_id]
            units = sum(
                1 for row in self.game_state['grid']
                for unit in row
                if unit is not None and unit['owner'] == player_id
            )
            total_resources.append(units + player['deployments_remaining'])
        
        if total_resources[0] < 3 and total_resources[1] < 3:
            self.done = True
            self.winner = None
            self.draw_reason = 'low_resources'
    
    def get_current_player(self) -> int:
        """Get current player ID."""
        return self.game_state['current_player']
    
    def get_turn_count(self) -> int:
        """Get current turn count."""
        return self.turn_count


def play_self_play_game(
    agent1,  # Agent object
    agent2,  # Agent object
    env: MultiAgentEnv,
    config: MultiAgentConfig
) -> Tuple[Dict, Dict, int, Optional[int], Optional[str]]:
    """
    Play a single self-play game between two agents.
    
    Args:
        agent1: First agent (plays as player 0)
        agent2: Second agent (plays as player 1)
        env: Game environment
        config: Training configuration
    
    Returns:
        trajectory1: Trajectory for agent1
        trajectory2: Trajectory for agent2
        episode_length: Number of turns
        winner: Winning player ID or None for draw
        draw_reason: Reason for draw if applicable
    """
    agents = [agent1, agent2]
    trajectories = [
        {
            'board_states': [],
            'global_features': [],
            'action_masks': [],
            'actions': [],
            'log_probs': [],
            'values': [],
            'rewards': [],
            'dones': []
        },
        {
            'board_states': [],
            'global_features': [],
            'action_masks': [],
            'actions': [],
            'log_probs': [],
            'values': [],
            'rewards': [],
            'dones': []
        }
    ]
    
    board_state, global_features, action_mask = env.reset()
    done = False
    
    while not done:
        current_player = env.get_current_player()
        agent = agents[current_player]
        traj = trajectories[current_player]
        
        # Store state
        traj['board_states'].append(board_state.copy())
        traj['global_features'].append(global_features.copy())
        traj['action_masks'].append(action_mask.copy())
        
        # Get action
        action, log_prob, value = agent.get_action(
            board_state, global_features, action_mask
        )
        
        traj['actions'].append(action)
        traj['log_probs'].append(log_prob)
        traj['values'].append(value)
        
        # Take step
        board_state, global_features, action_mask, reward, done, info = env.step(action)
        
        # Store reward and done
        traj['rewards'].append(0.0)  # Intermediate reward is 0
        traj['dones'].append(done)
    
    # Assign final rewards
    winner = info.get('winner')
    draw_reason = info.get('draw_reason')
    
    for player_id in [0, 1]:
        if len(trajectories[player_id]['rewards']) > 0:
            if winner == player_id:
                trajectories[player_id]['rewards'][-1] = config.reward_win
            elif winner == 1 - player_id:
                trajectories[player_id]['rewards'][-1] = config.reward_loss
            elif draw_reason == 'turn_limit':
                trajectories[player_id]['rewards'][-1] = config.reward_draw_turn_limit
            else:
                trajectories[player_id]['rewards'][-1] = config.reward_draw_other
    
    episode_length = env.get_turn_count()
    
    return trajectories[0], trajectories[1], episode_length, winner, draw_reason
