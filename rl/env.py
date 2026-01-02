"""
Gym-style Environment Wrapper for the Turn-Based Strategy Game
==============================================================

This module wraps the existing game engine in a Gym-compatible interface
for reinforcement learning training.

Draw Detection Rules:
- Maximum Turn Draw: turnCount >= 1000 → DRAW
- Repeated State Draw: Same state hash occurs 10 times → DRAW
- No-Progress Draw: 100 turns without capture AND 100 turns without unit death → DRAW
"""

import numpy as np
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass, field
from enum import IntEnum
from collections import defaultdict
import copy
import hashlib


class UnitType(IntEnum):
    """Unit type enumeration matching the game engine."""
    EMPTY = 0
    SWORDSMAN = 1
    SHIELDMAN = 2
    AXEMAN = 3
    CAVALRY = 4
    ARCHER = 5
    SPEARMAN = 6


class ActionType(IntEnum):
    """Action type enumeration."""
    DEPLOY = 0
    MOVE = 1
    ATTACK = 2
    ROTATE = 3
    END_TURN = 4


class GameOutcome(IntEnum):
    """
    Game outcome enumeration.
    
    Explicitly includes DRAW as a terminal state.
    """
    IN_PROGRESS = 0
    PLAYER_0_WIN = 1
    PLAYER_1_WIN = 2
    DRAW = 3


class DrawReason(IntEnum):
    """Reason for a draw occurring."""
    NONE = 0
    MAX_TURNS = 1          # turnCount >= 1000
    REPEATED_STATE = 2     # Same state hash 10 times
    NO_PROGRESS = 3        # 100 turns without capture AND unit death


@dataclass
class Unit:
    """Represents a unit on the board."""
    id: str
    owner_id: int
    unit_type: UnitType
    position: Tuple[int, int]  # (row, col) 0-indexed
    acted_this_turn: bool = False


@dataclass
class GameState:
    """Represents the full game state."""
    grid: List[List[Optional[Unit]]]  # 5x5 grid
    current_player: int  # 0 or 1
    turn_number: int
    players: List[Dict[str, Any]]
    free_deployments_remaining: int
    has_acted_this_turn: bool


# Unit stats from the game
UNIT_STATS = {
    UnitType.SWORDSMAN: {"move_range": 1, "attack_range": 1},
    UnitType.SHIELDMAN: {"move_range": 1, "attack_range": 1},
    UnitType.AXEMAN: {"move_range": 1, "attack_range": 1},
    UnitType.CAVALRY: {"move_range": 2, "attack_range": 1},
    UnitType.ARCHER: {"move_range": 1, "attack_range": 2},
    UnitType.SPEARMAN: {"move_range": 1, "attack_range": 2},
}

# ═══════════════════════════════════════════════════════════════════════════════
# Combat matchups - MUST match backend/frontend rules.ts
# ═══════════════════════════════════════════════════════════════════════════════
# Melee combat (orthogonal adjacency)
MELEE_BEATS = {
    # Swordsman defeats: Archer, Cavalry, Axeman, Swordsman, Spearman
    UnitType.SWORDSMAN: [UnitType.ARCHER, UnitType.CAVALRY, UnitType.AXEMAN, UnitType.SWORDSMAN, UnitType.SPEARMAN],
    # Shieldbearer(Shieldman) defeats: Archer
    UnitType.SHIELDMAN: [UnitType.ARCHER],
    # Axeman defeats: Archer, Shieldbearer, Cavalry, Axeman, Spearman
    UnitType.AXEMAN: [UnitType.ARCHER, UnitType.SHIELDMAN, UnitType.CAVALRY, UnitType.AXEMAN, UnitType.SPEARMAN],
    # Cavalry defeats: Archer, Cavalry, Spearman
    UnitType.CAVALRY: [UnitType.ARCHER, UnitType.CAVALRY, UnitType.SPEARMAN],
    # Archer defeats: Archer (melee only)
    UnitType.ARCHER: [UnitType.ARCHER],
    # Spearman defeats: Archer, Shieldbearer, Cavalry, Spearman (melee)
    UnitType.SPEARMAN: [UnitType.ARCHER, UnitType.SHIELDMAN, UnitType.CAVALRY, UnitType.SPEARMAN],
}

# Ranged combat (Attack Range 2, for Archer and Spearman)
# Archer's Defeats(ranged): Archer, Cavalry, Axeman, Swordsman, Spearman
# Spearman's Defeats(ranged): Archer, Cavalry, Spearman
# Note: Shieldman is immune to ranged attacks
RANGED_BEATS = {
    UnitType.ARCHER: [UnitType.ARCHER, UnitType.CAVALRY, UnitType.AXEMAN, UnitType.SWORDSMAN, UnitType.SPEARMAN],
    UnitType.SPEARMAN: [UnitType.ARCHER, UnitType.CAVALRY, UnitType.SPEARMAN],
}

# Legacy alias for compatibility
BEATS = MELEE_BEATS

# Control points (1-indexed in original, 0-indexed here)
CONTROL_POINTS = [(2, 0), (2, 2), (2, 4)]  # Row 3, cols 1, 3, 5 in 1-indexed
OUTSIDE_POINTS = [(2, 0), (2, 4)]  # Side control points


class NovusXEnv:
    """
    Gym-style environment for the NovusX turn-based strategy game.
    
    Supports two players taking alternating turns.
    
    Draw Conditions:
    1. Maximum Turn Draw: turnCount >= 1000
    2. Repeated State Draw: Same state hash occurs 10 times
    3. No-Progress Draw: 100 turns without capture AND 100 turns without unit death
    
    Rewards:
    - Win: +1.0 for winner, -1.0 for loser
    - Draw: 0.0 for both players
    - Per-turn penalty: -0.001 (configurable)
    """
    
    # Grid dimensions
    GRID_SIZE = 5
    NUM_UNIT_TYPES = 6  # Excluding EMPTY
    
    # Action space dimensions
    DEPLOY_ACTIONS = 6 * 5 * 5  # 6 unit types * 5 deploy columns (30 actions per row, 150 total max)
    MOVE_ACTIONS = 25 * 25  # Source * target
    ATTACK_ACTIONS = 25 * 25
    ROTATE_ACTIONS = 25 * 25  # Simplified: unit position * target position
    END_TURN_ACTIONS = 1
    
    ACTION_SPACE_SIZE = DEPLOY_ACTIONS + MOVE_ACTIONS + ATTACK_ACTIONS + ROTATE_ACTIONS + END_TURN_ACTIONS
    
    # State representation dimensions
    STATE_CHANNELS = 11  # Unit type one-hot (6) + owner (3) + acted (1) + is_control_point (1)
    GLOBAL_FEATURES = 7
    
    # =========================================================
    # Draw detection constants
    # =========================================================
    MAX_TURN_LIMIT = 1000           # Max turns before forced draw
    REPEATED_STATE_LIMIT = 10       # Same state N times = draw
    NO_PROGRESS_TURN_LIMIT = 100    # Turns without capture/death for draw
    
    # Maximum deployments per unit type per player (rules: max 3)
    MAX_DEPLOYMENTS_PER_TYPE = 3
    
    def __init__(self, config: Optional[Dict] = None):
        """Initialize the environment."""
        self.config = config or {}
        self.max_steps = self.config.get("max_steps_per_game", 2000)  # Allow for 1000 turns
        self.state: Optional[GameState] = None
        self.step_count = 0
        self._unit_counter = 0
        
        # =========================================================
        # Draw detection state
        # =========================================================
        self.state_hash_counts: Dict[str, int] = defaultdict(int)  # Track state repetitions
        self.turns_since_last_capture = 0      # Turns without control point capture
        self.turns_since_last_unit_death = 0   # Turns without any unit dying
        self.last_control_ownership: Dict[Tuple[int, int], Optional[int]] = {}  # Track control point changes
        
        # Game outcome tracking
        self.game_outcome = GameOutcome.IN_PROGRESS
        self.draw_reason = DrawReason.NONE
        
        # =========================================================
        # Training mode flag
        # When True: Apply draw-type-specific rewards to shape behavior
        # When False (eval/inference): All draws treated as 0.0 reward
        # =========================================================
        self.training_mode = True
        
        # =========================================================
        # Reward configuration (terminal rewards per spec)
        # =========================================================
        rewards_config = self.config.get("rewards", {})
        self.rewards = {
            # ─────────────────────────────────────────────────────────────
            # TERMINAL REWARDS (DOMINANT - assigned exactly once at game end)
            # ─────────────────────────────────────────────────────────────
            "win": rewards_config.get("win", 1.0),           # Winner gets +1.0
            "lose": rewards_config.get("lose", -1.0),         # Loser gets -1.0
            
            # ─────────────────────────────────────────────────────────────
            # DRAW-TYPE-SPECIFIC REWARDS (Training mode only)
            # Different draw types get different penalties to shape agent behavior:
            # - no_progress: 0.0 (neutral - not agent's fault)
            # - repetition: -0.2 (agents should avoid repeating states)
            # - max_turns: -0.3 (agents should resolve games faster)
            # All penalties < loss (-1.0) to avoid risk-averse play
            # ─────────────────────────────────────────────────────────────
            "draw_no_progress": rewards_config.get("draw_no_progress", 0.0),
            "draw_repetition": rewards_config.get("draw_repetition", -0.2),
            "draw_max_turns": rewards_config.get("draw_max_turns", -0.3),
            "draw_default": rewards_config.get("draw_default", 0.0),  # Eval mode
            
            # ─────────────────────────────────────────────────────────────
            # PER-TURN PENALTIES (prevents stalling)
            # ─────────────────────────────────────────────────────────────
            "turn_penalty": rewards_config.get("turn_penalty", -0.001),
            
            # ─────────────────────────────────────────────────────────────
            # OBJECTIVE REWARDS (Control Points - irreversible progress)
            # ─────────────────────────────────────────────────────────────
            "capture_control_point": rewards_config.get("capture_control_point", 0.3),
            "lose_control_point": rewards_config.get("lose_control_point", -0.3),
            "control_point_advantage": rewards_config.get("control_point_advantage", 0.02),
            
            # ─────────────────────────────────────────────────────────────
            # COMBAT REWARDS (Unit defeats - irreversible progress)
            # ─────────────────────────────────────────────────────────────
            "defeat_enemy_unit": rewards_config.get("defeat_enemy_unit", 0.07),
            "lose_own_unit": rewards_config.get("lose_own_unit", -0.07),
            
            # Invalid action penalty
            "invalid_action_penalty": rewards_config.get("invalid_action_penalty", -0.5),
        }
        
    def reset(self) -> np.ndarray:
        """
        Reset the environment to initial state.
        
        Returns:
            Initial state observation as a numpy array.
        """
        self._unit_counter = 0
        self.step_count = 0
        
        # =========================================================
        # Reset draw detection state
        # =========================================================
        self.state_hash_counts = defaultdict(int)
        self.turns_since_last_capture = 0
        self.turns_since_last_unit_death = 0
        self.last_control_ownership = {pos: None for pos in CONTROL_POINTS}
        self.game_outcome = GameOutcome.IN_PROGRESS
        self.draw_reason = DrawReason.NONE
        
        # Create empty 5x5 grid
        grid = [[None for _ in range(5)] for _ in range(5)]
        
        # Initialize players with deployment counts per type
        initial_deployment_counts = {
            UnitType.SWORDSMAN: 0,
            UnitType.SHIELDMAN: 0,
            UnitType.AXEMAN: 0,
            UnitType.CAVALRY: 0,
            UnitType.ARCHER: 0,
            UnitType.SPEARMAN: 0,
        }
        players = [
            {"id": 0, "actions_remaining": 1, "deployments_remaining": 10, "deployment_counts": dict(initial_deployment_counts)},
            {"id": 1, "actions_remaining": 0, "deployments_remaining": 10, "deployment_counts": dict(initial_deployment_counts)},
        ]
        
        self.state = GameState(
            grid=grid,
            current_player=0,
            turn_number=1,
            players=players,
            free_deployments_remaining=0,
            has_acted_this_turn=False,
        )
        
        return self._get_observation(0)
    
    def step(self, action: int, player_id: Optional[int] = None) -> Tuple[np.ndarray, float, bool, Dict]:
        """
        Apply an action and return the result.
        
        Args:
            action: The action index to apply.
            player_id: The player taking the action (defaults to current player).
            
        Returns:
            Tuple of (next_state, reward, done, info)
            
        Draw conditions checked after every action:
        1. Max turns (>= 1000)
        2. Repeated state (same hash 10 times)
        3. No progress (100 turns without capture AND unit death)
        """
        if self.state is None:
            raise RuntimeError("Environment not initialized. Call reset() first.")
        
        if player_id is None:
            player_id = self.state.current_player
            
        # Validate it's the player's turn
        if player_id != self.state.current_player:
            return (
                self._get_observation(player_id),
                self.rewards["invalid_action_penalty"],
                False,
                {"error": "Not your turn"}
            )
        
        self.step_count += 1
        
        # Track state before action for reward calculation
        prev_control = self._count_control_points(player_id)
        prev_units = self._count_units(player_id)
        enemy_id = 1 - player_id
        prev_enemy_units = self._count_units(enemy_id)
        prev_total_units = prev_units + prev_enemy_units
        
        # Store control point ownership before action
        prev_control_ownership = {
            pos: self._get_control_owner(pos) for pos in CONTROL_POINTS
        }
        
        # Parse and apply action
        action_type, action_params = self._parse_action(action)
        valid, error_msg = self._apply_action(action_type, action_params, player_id)
        
        if not valid:
            return (
                self._get_observation(player_id),
                self.rewards["invalid_action_penalty"],
                False,
                {"error": error_msg}
            )
        
        # =========================================================
        # Update no-progress tracking
        # =========================================================
        curr_total_units = self._count_units(0) + self._count_units(1)
        unit_died = curr_total_units < prev_total_units
        
        # Check for control point ownership changes
        control_changed = False
        for pos in CONTROL_POINTS:
            curr_owner = self._get_control_owner(pos)
            if curr_owner != prev_control_ownership[pos]:
                control_changed = True
                break
        
        # Update no-progress counters
        if control_changed:
            self.turns_since_last_capture = 0
        
        if unit_died:
            self.turns_since_last_unit_death = 0
        
        # =========================================================
        # Calculate reward (shaping rewards, not terminal)
        # =========================================================
        reward = self.rewards["turn_penalty"]  # Small penalty per turn to discourage stalling
        
        # ─────────────────────────────────────────────────────────────────
        # CONTROL POINT REWARDS (irreversible progress)
        # +0.3 per capture, -0.3 per loss
        # ─────────────────────────────────────────────────────────────────
        curr_control = self._count_control_points(player_id)
        enemy_control = self._count_control_points(enemy_id)
        
        if curr_control > prev_control:
            reward += self.rewards["capture_control_point"] * (curr_control - prev_control)
        elif curr_control < prev_control:
            reward += self.rewards["lose_control_point"] * (prev_control - curr_control)
        
        # ─────────────────────────────────────────────────────────────────
        # CONTROL POINT ADVANTAGE BONUS (per turn)
        # +0.02 × (our_cp - enemy_cp) if we have advantage
        # Zero reward if equal control points
        # ─────────────────────────────────────────────────────────────────
        control_advantage = curr_control - enemy_control
        if control_advantage != 0:
            reward += self.rewards["control_point_advantage"] * control_advantage
        
        # ─────────────────────────────────────────────────────────────────
        # COMBAT REWARDS (irreversible progress)
        # +0.07 per enemy defeated, -0.07 per own unit lost
        # ─────────────────────────────────────────────────────────────────
        curr_units = self._count_units(player_id)
        if curr_units < prev_units:
            reward += self.rewards["lose_own_unit"] * (prev_units - curr_units)
        
        curr_enemy_units = self._count_units(enemy_id)
        if curr_enemy_units < prev_enemy_units:
            reward += self.rewards["defeat_enemy_unit"] * (prev_enemy_units - curr_enemy_units)
        
        # =========================================================
        # Check for game end (win conditions first, then draw conditions)
        # =========================================================
        done = False
        winner = None
        
        # Check win conditions (unchanged from original)
        winner = self._check_winner()
        
        if winner is not None:
            # Game ends with a winner
            done = True
            self.game_outcome = GameOutcome.PLAYER_0_WIN if winner == 0 else GameOutcome.PLAYER_1_WIN
            
            # Terminal reward: +1.0 for winner, -1.0 for loser
            if winner == player_id:
                reward = self.rewards["win"]
            else:
                reward = self.rewards["lose"]
        else:
            # Check draw conditions
            draw_detected, draw_reason = self._check_draw_conditions()
            
            if draw_detected:
                done = True
                winner = None  # Explicitly no winner
                self.game_outcome = GameOutcome.DRAW
                self.draw_reason = draw_reason
                
                # ─────────────────────────────────────────────────────────
                # DRAW-TYPE-SPECIFIC TERMINAL REWARDS
                # Apply different rewards based on WHY the draw occurred.
                # This shapes agent behavior without changing game rules:
                # - no_progress: Neutral (stalemate is acceptable)
                # - repetition: Slight penalty (avoid repeating states)
                # - max_turns: Moderate penalty (resolve games faster)
                # During evaluation/inference, all draws are 0.0.
                # ─────────────────────────────────────────────────────────
                reward = self._get_draw_reward(draw_reason)
                
                # Log draw for debugging
                self._log_draw(draw_reason)
        
        # Build info dictionary
        info = {
            "winner": winner,
            "turn_number": self.state.turn_number,
            "current_player": self.state.current_player,
            "game_outcome": self.game_outcome,
            "is_draw": self.game_outcome == GameOutcome.DRAW,
            "draw_reason": self.draw_reason.name if self.draw_reason != DrawReason.NONE else None,
            "draw_reward": reward if self.game_outcome == GameOutcome.DRAW else None,
            "training_mode": self.training_mode,
            "turns_since_capture": self.turns_since_last_capture,
            "turns_since_death": self.turns_since_last_unit_death,
        }
        
        return self._get_observation(player_id), reward, done, info
    
    # =========================================================
    # Draw Detection Methods
    # =========================================================
    
    def _check_draw_conditions(self) -> Tuple[bool, DrawReason]:
        """
        Check all draw conditions after an action.
        
        Returns:
            Tuple of (is_draw, draw_reason)
        
        Draw conditions (checked in order):
        1. MAX_TURN_LIMIT: turnCount >= 1000
        2. REPEATED_STATE: Same state hash occurs 10 times
        3. NO_PROGRESS: 100 turns without capture AND 100 turns without unit death
        """
        # 1. Maximum Turn Draw
        if self.state.turn_number >= self.MAX_TURN_LIMIT:
            return True, DrawReason.MAX_TURNS
        
        # 2. Repeated State Draw
        state_hash = self._compute_state_hash()
        self.state_hash_counts[state_hash] += 1
        
        if self.state_hash_counts[state_hash] >= self.REPEATED_STATE_LIMIT:
            return True, DrawReason.REPEATED_STATE
        
        # 3. No-Progress Draw
        # Both conditions must be met: no captures AND no deaths for 100 turns each
        if (self.turns_since_last_capture >= self.NO_PROGRESS_TURN_LIMIT and 
            self.turns_since_last_unit_death >= self.NO_PROGRESS_TURN_LIMIT):
            return True, DrawReason.NO_PROGRESS
        
        return False, DrawReason.NONE
    
    def _compute_state_hash(self) -> str:
        """
        Compute a deterministic hash of the full game state.
        
        Includes:
        - Board layout (unit positions)
        - Unit types
        - Unit owners
        - Control point ownership
        - Current player to move
        
        Returns:
            Hex string hash of the game state
        """
        # Build a canonical representation of the state
        state_parts = []
        
        # Board layout: for each cell, encode unit info
        for row in range(5):
            for col in range(5):
                unit = self.state.grid[row][col]
                if unit:
                    # Encode: position, type, owner
                    state_parts.append(f"{row},{col}:{unit.unit_type.value}:{unit.owner_id}")
                else:
                    state_parts.append(f"{row},{col}:empty")
        
        # Control point ownership
        for pos in sorted(CONTROL_POINTS):
            owner = self._get_control_owner(pos)
            state_parts.append(f"cp{pos}:{owner}")
        
        # Current player to move
        state_parts.append(f"player:{self.state.current_player}")
        
        # Create deterministic hash
        state_string = "|".join(state_parts)
        return hashlib.md5(state_string.encode()).hexdigest()
    
    def _get_control_owner(self, pos: Tuple[int, int]) -> Optional[int]:
        """Get the owner of a control point (or None if unoccupied)."""
        unit = self.state.grid[pos[0]][pos[1]]
        return unit.owner_id if unit else None
    
    def _log_draw(self, reason: DrawReason):
        """Log draw termination for debugging and analysis."""
        reason_messages = {
            DrawReason.MAX_TURNS: f"DRAW: Maximum turn limit reached ({self.MAX_TURN_LIMIT} turns)",
            DrawReason.REPEATED_STATE: f"DRAW: Repeated state detected ({self.REPEATED_STATE_LIMIT} repetitions)",
            DrawReason.NO_PROGRESS: f"DRAW: No progress for {self.NO_PROGRESS_TURN_LIMIT} turns (no captures or deaths)",
        }
        # Log the draw with its reward (helpful for debugging reward shaping)
        reward = self._get_draw_reward(reason)
        msg = reason_messages.get(reason, 'Unknown draw reason')
        mode = "training" if self.training_mode else "eval"
        print(f"[Game Over] {msg} at turn {self.state.turn_number} | reward={reward:.2f} ({mode} mode)")
    
    def _get_draw_reward(self, reason: DrawReason) -> float:
        """
        Get the terminal reward for a draw based on its cause.
        
        ASYMMETRIC DRAW REWARDS (Training Only)
        ========================================
        Different draw types receive different penalties to shape agent behavior
        without changing game rules or action space:
        
        | Draw Type     | Reward | Rationale                                    |
        |---------------|--------|----------------------------------------------|
        | no_progress   |  0.0   | Stalemate is acceptable, not agent's fault   |
        | repetition    | -0.2   | Agents should avoid repeating states         |
        | max_turns     | -0.3   | Agents should resolve games faster           |
        
        Key Design Choices:
        - All draw penalties are LESS severe than a loss (-1.0) to avoid
          risk-averse behavior where agents prefer losing over drawing.
        - During evaluation/inference/human play, all draws return 0.0
          to ensure consistent game semantics.
        - Terminal draw rewards OVERRIDE any per-turn shaping rewards
          accumulated during the episode (reward is replaced, not added).
        
        Args:
            reason: The DrawReason enum value indicating why the draw occurred
            
        Returns:
            Terminal reward value for the draw
        """
        # During evaluation/inference, all draws are neutral (0.0)
        # This ensures consistent game semantics outside of training
        if not self.training_mode:
            return self.rewards["draw_default"]
        
        # During training, apply draw-type-specific rewards
        # to shape agent behavior toward decisive play
        if reason == DrawReason.NO_PROGRESS:
            # Stalemate due to no captures or deaths
            # Neutral reward: this is often a balanced position, not agent's fault
            return self.rewards["draw_no_progress"]
        
        elif reason == DrawReason.REPEATED_STATE:
            # Same board state occurred multiple times
            # Slight penalty: agents should explore different strategies
            return self.rewards["draw_repetition"]
        
        elif reason == DrawReason.MAX_TURNS:
            # Game exceeded maximum turn limit
            # Moderate penalty: agents should resolve games decisively
            return self.rewards["draw_max_turns"]
        
        else:
            # Unknown draw reason - fallback to default
            return self.rewards["draw_default"]
    
    def set_training_mode(self, training: bool = True):
        """
        Set whether the environment is in training mode.
        
        In training mode:
        - Draw-type-specific rewards are applied
        - Agents are penalized for repetition (-0.2) and max_turns (-0.3)
        
        In evaluation/inference mode:
        - All draws receive 0.0 reward
        - Game semantics are consistent with human play
        
        Args:
            training: True for training mode, False for evaluation/inference
        """
        self.training_mode = training
    
    def get_valid_actions_mask(self, player_id: Optional[int] = None) -> np.ndarray:
        """
        Get a boolean mask of valid actions for the given player.
        
        Args:
            player_id: The player to get valid actions for.
            
        Returns:
            Boolean numpy array of shape (ACTION_SPACE_SIZE,)
        """
        if self.state is None:
            return np.zeros(self.ACTION_SPACE_SIZE, dtype=np.float32)
        
        if player_id is None:
            player_id = self.state.current_player
            
        mask = np.zeros(self.ACTION_SPACE_SIZE, dtype=np.float32)
        
        # If not this player's turn, only END_TURN is technically "valid" to pass
        if player_id != self.state.current_player:
            return mask
        
        player = self.state.players[player_id]
        has_actions = player["actions_remaining"] > 0
        has_deployments = player["deployments_remaining"] > 0
        deployment_counts = player.get("deployment_counts", {})
        
        # Deploy actions
        if has_actions and has_deployments:
            deploy_row = 0 if player_id == 0 else 4
            for unit_type_idx in range(5):
                # Map index to UnitType enum (1-5)
                unit_type = UnitType(unit_type_idx + 1)
                # Check per-type limit
                type_count = deployment_counts.get(unit_type, 0)
                if type_count >= self.MAX_DEPLOYMENTS_PER_TYPE:
                    continue
                for col in range(5):
                    if self.state.grid[deploy_row][col] is None:
                        action_idx = self._encode_deploy(unit_type_idx + 1, col)
                        mask[action_idx] = 1.0
        
        # Move actions
        if has_actions:
            for row in range(5):
                for col in range(5):
                    unit = self.state.grid[row][col]
                    if unit and unit.owner_id == player_id and not unit.acted_this_turn:
                        for target_row in range(5):
                            for target_col in range(5):
                                if self._can_move(unit, (row, col), (target_row, target_col)):
                                    action_idx = self._encode_move((row, col), (target_row, target_col))
                                    mask[action_idx] = 1.0
        
        # Attack actions
        if has_actions:
            for row in range(5):
                for col in range(5):
                    unit = self.state.grid[row][col]
                    if unit and unit.owner_id == player_id and not unit.acted_this_turn:
                        for target_row in range(5):
                            for target_col in range(5):
                                target_unit = self.state.grid[target_row][target_col]
                                if target_unit and target_unit.owner_id != player_id:
                                    if self._can_attack(unit, (row, col), (target_row, target_col), target_unit):
                                        action_idx = self._encode_attack((row, col), (target_row, target_col))
                                        mask[action_idx] = 1.0
        
        # Rotate actions - any unit can do adjacent orthogonal swap, cavalry has extra options
        if has_actions:
            for row in range(5):
                for col in range(5):
                    unit = self.state.grid[row][col]
                    if unit and unit.owner_id == player_id and not unit.acted_this_turn:
                        for target_row in range(5):
                            for target_col in range(5):
                                if self._can_rotate(unit, (row, col), (target_row, target_col), player_id):
                                    action_idx = self._encode_rotate((row, col), (target_row, target_col))
                                    mask[action_idx] = 1.0
        
        # End turn is always valid
        mask[self.ACTION_SPACE_SIZE - 1] = 1.0
        
        return mask
    
    def _get_observation(self, player_id: int) -> np.ndarray:
        """
        Get the observation from the perspective of the given player.
        
        State is encoded as:
        - Spatial features: (GRID_SIZE, GRID_SIZE, STATE_CHANNELS)
        - Global features: (GLOBAL_FEATURES,)
        
        Returns flattened array.
        """
        spatial = np.zeros((self.GRID_SIZE, self.GRID_SIZE, self.STATE_CHANNELS), dtype=np.float32)
        
        for row in range(5):
            for col in range(5):
                unit = self.state.grid[row][col]
                
                if unit:
                    # Unit type one-hot (channels 0-5)
                    spatial[row, col, int(unit.unit_type)] = 1.0
                    
                    # Owner (channels 6-8): empty, self, enemy
                    if unit.owner_id == player_id:
                        spatial[row, col, 7] = 1.0  # Self
                    else:
                        spatial[row, col, 8] = 1.0  # Enemy
                        
                    # Acted this turn (channel 9)
                    spatial[row, col, 9] = 1.0 if unit.acted_this_turn else 0.0
                else:
                    # Empty tile
                    spatial[row, col, 0] = 1.0  # Empty type
                    spatial[row, col, 6] = 1.0  # Empty owner
                
                # Control point marker (channel 10)
                if (row, col) in CONTROL_POINTS:
                    spatial[row, col, 10] = 1.0
        
        # Global features
        player = self.state.players[player_id]
        enemy = self.state.players[1 - player_id]
        
        global_features = np.array([
            self.state.turn_number / 100.0,  # Normalized turn number
            player["actions_remaining"] / 3.0,  # Normalized actions
            player["deployments_remaining"] / 10.0,  # Normalized deployments
            enemy["deployments_remaining"] / 10.0,  # Enemy deployments
            self._count_control_points(player_id) / 3.0,  # Our control points
            self._count_control_points(1 - player_id) / 3.0,  # Enemy control points
            1.0 if self.state.current_player == player_id else 0.0,  # Is our turn
        ], dtype=np.float32)
        
        # Flatten and concatenate
        return np.concatenate([spatial.flatten(), global_features])
    
    def _parse_action(self, action: int) -> Tuple[ActionType, Dict]:
        """Parse action index into action type and parameters."""
        if action < self.DEPLOY_ACTIONS:
            # Deploy action
            unit_type = (action // 25) + 1  # 1-5
            col = action % 5
            return ActionType.DEPLOY, {"unit_type": UnitType(unit_type), "col": col}
        
        action -= self.DEPLOY_ACTIONS
        
        if action < self.MOVE_ACTIONS:
            # Move action
            source = divmod(action, 25)
            source_row, source_col = divmod(source[0], 5)
            source_col_unused = source[0] % 5
            target_row, target_col = divmod(action % 25, 5)
            source_row, source_col = divmod(action // 25, 5)
            target_row, target_col = divmod(action % 25, 5)
            return ActionType.MOVE, {
                "source": (source_row, source_col),
                "target": (target_row, target_col)
            }
        
        action -= self.MOVE_ACTIONS
        
        if action < self.ATTACK_ACTIONS:
            # Attack action
            source_row, source_col = divmod(action // 25, 5)
            target_row, target_col = divmod(action % 25, 5)
            return ActionType.ATTACK, {
                "source": (source_row, source_col),
                "target": (target_row, target_col)
            }
        
        action -= self.ATTACK_ACTIONS
        
        if action < self.ROTATE_ACTIONS:
            # Rotate action
            source_row, source_col = divmod(action // 25, 5)
            target_row, target_col = divmod(action % 25, 5)
            return ActionType.ROTATE, {
                "source": (source_row, source_col),
                "target": (target_row, target_col)
            }
        
        # End turn
        return ActionType.END_TURN, {}
    
    def _apply_action(self, action_type: ActionType, params: Dict, player_id: int) -> Tuple[bool, str]:
        """Apply an action to the game state. Returns (success, error_message)."""
        player = self.state.players[player_id]
        
        if action_type == ActionType.END_TURN:
            self._end_turn()
            return True, ""
        
        if player["actions_remaining"] <= 0:
            return False, "No actions remaining"
        
        if action_type == ActionType.DEPLOY:
            return self._apply_deploy(params, player_id)
        elif action_type == ActionType.MOVE:
            return self._apply_move(params, player_id)
        elif action_type == ActionType.ATTACK:
            return self._apply_attack(params, player_id)
        elif action_type == ActionType.ROTATE:
            return self._apply_rotate(params, player_id)
        
        return False, "Unknown action type"
    
    def _apply_deploy(self, params: Dict, player_id: int) -> Tuple[bool, str]:
        """Apply a deploy action."""
        player = self.state.players[player_id]
        
        if player["deployments_remaining"] <= 0:
            return False, "No deployments remaining"
        
        unit_type = params["unit_type"]
        col = params["col"]
        row = 0 if player_id == 0 else 4
        
        if self.state.grid[row][col] is not None:
            return False, "Tile occupied"
        
        # Check per-type deployment limit
        deployment_counts = player.get("deployment_counts", {})
        type_count = deployment_counts.get(unit_type, 0)
        if type_count >= self.MAX_DEPLOYMENTS_PER_TYPE:
            return False, f"Max {self.MAX_DEPLOYMENTS_PER_TYPE} of {unit_type.name} already deployed"
        
        # Create and place unit
        self._unit_counter += 1
        unit = Unit(
            id=f"{player_id}-{unit_type.name}-{self._unit_counter}",
            owner_id=player_id,
            unit_type=unit_type,
            position=(row, col),
            acted_this_turn=True
        )
        self.state.grid[row][col] = unit
        
        # Decrement resources and increment per-type count
        player["deployments_remaining"] -= 1
        player["actions_remaining"] -= 1
        if "deployment_counts" not in player:
            player["deployment_counts"] = {}
        player["deployment_counts"][unit_type] = deployment_counts.get(unit_type, 0) + 1
        self.state.has_acted_this_turn = True
        
        # Auto end turn if no actions left
        if player["actions_remaining"] <= 0:
            self._end_turn()
        
        return True, ""
    
    def _apply_move(self, params: Dict, player_id: int) -> Tuple[bool, str]:
        """Apply a move action."""
        source = params["source"]
        target = params["target"]
        
        unit = self.state.grid[source[0]][source[1]]
        if not unit or unit.owner_id != player_id:
            return False, "No friendly unit at source"
        
        if unit.acted_this_turn:
            return False, "Unit already acted"
        
        if not self._can_move(unit, source, target):
            return False, "Invalid move"
        
        # Move unit
        self.state.grid[source[0]][source[1]] = None
        unit.position = target
        unit.acted_this_turn = True
        self.state.grid[target[0]][target[1]] = unit
        
        # Decrement actions
        self.state.players[player_id]["actions_remaining"] -= 1
        self.state.has_acted_this_turn = True
        
        if self.state.players[player_id]["actions_remaining"] <= 0:
            self._end_turn()
        
        return True, ""
    
    def _apply_attack(self, params: Dict, player_id: int) -> Tuple[bool, str]:
        """
        Apply an attack action.
        
        Combat rules:
        - Melee (orthogonal adjacency): Use MELEE_BEATS table
        - Ranged (Archer or Spearman, distance 2): Use RANGED_BEATS dict, Shieldman immune
        - If both can defeat each other, both die
        """
        source = params["source"]
        target = params["target"]
        
        attacker = self.state.grid[source[0]][source[1]]
        if not attacker or attacker.owner_id != player_id:
            return False, "No friendly unit at source"
        
        if attacker.acted_this_turn:
            return False, "Unit already acted"
        
        defender = self.state.grid[target[0]][target[1]]
        if not defender or defender.owner_id == player_id:
            return False, "No enemy unit at target"
        
        if not self._can_attack(attacker, source, target, defender):
            return False, "Invalid attack"
        
        # Determine if melee or ranged
        dist = abs(source[0] - target[0]) + abs(source[1] - target[1])
        is_melee = dist == 1
        
        # Resolve combat
        remove_attacker = False
        remove_defender = False
        
        if not is_melee and attacker.unit_type in (UnitType.ARCHER, UnitType.SPEARMAN):
            # Ranged attack - use RANGED_BEATS dict
            ranged_targets = RANGED_BEATS.get(attacker.unit_type, [])
            if defender.unit_type in ranged_targets:
                remove_defender = True
            # Shieldman is immune, no effect
        else:
            # Melee combat - use MELEE_BEATS
            attacker_wins = defender.unit_type in MELEE_BEATS.get(attacker.unit_type, [])
            defender_wins = attacker.unit_type in MELEE_BEATS.get(defender.unit_type, [])
            
            if attacker_wins and defender_wins:
                # Mutual destruction
                remove_attacker = True
                remove_defender = True
            elif attacker_wins:
                remove_defender = True
            elif defender_wins:
                remove_attacker = True
        
        # Apply removals
        if remove_attacker:
            self.state.grid[source[0]][source[1]] = None
        else:
            attacker.acted_this_turn = True
        
        if remove_defender:
            self.state.grid[target[0]][target[1]] = None
        
        # Decrement actions
        self.state.players[player_id]["actions_remaining"] -= 1
        self.state.has_acted_this_turn = True
        
        if self.state.players[player_id]["actions_remaining"] <= 0:
            self._end_turn()
        
        return True, ""
    
    def _apply_rotate(self, params: Dict, player_id: int) -> Tuple[bool, str]:
        """
        Apply a rotate action (swap).
        
        Rules:
        - Any unit can do orthogonal adjacent swaps (distance 1)
        - Only Cavalry can do diagonal swaps and long rotations (distance 2)
        - Cannot swap units of the same type
        - Only the initiating unit uses its action
        - The target unit does NOT have its action consumed
        """
        source = params["source"]
        target = params["target"]
        
        unit = self.state.grid[source[0]][source[1]]
        if not unit or unit.owner_id != player_id:
            return False, "No friendly unit at source"
        
        if unit.acted_this_turn:
            return False, "Unit already acted"
        
        target_unit = self.state.grid[target[0]][target[1]]
        if not target_unit or target_unit.owner_id != player_id:
            return False, "No friendly unit at target"
        
        # Cannot swap units of the same type
        if unit.unit_type == target_unit.unit_type:
            return False, "Cannot swap units of same type"
        
        # Check distance and validity
        dx = abs(target[1] - source[1])
        dy = abs(target[0] - source[0])
        is_diagonal = dx == 1 and dy == 1
        manhattan_dist = dx + dy
        
        # Orthogonal adjacent (distance 1) - any unit can do this
        if manhattan_dist == 1:
            pass  # Valid for all units
        # Diagonal adjacent - only cavalry
        elif is_diagonal:
            if unit.unit_type != UnitType.CAVALRY:
                return False, "Only cavalry can do diagonal swaps"
        # Long rotation (distance 2 orthogonally) - only cavalry with empty middle
        elif manhattan_dist == 2 and (dx == 0 or dy == 0):
            if unit.unit_type != UnitType.CAVALRY:
                return False, "Only cavalry can do long rotations"
            # Check middle tile is empty
            mid_row = (source[0] + target[0]) // 2
            mid_col = (source[1] + target[1]) // 2
            if self.state.grid[mid_row][mid_col] is not None:
                return False, "Middle tile not empty for long rotation"
        else:
            return False, "Invalid rotation distance"
        
        # Swap positions
        self.state.grid[source[0]][source[1]] = target_unit
        self.state.grid[target[0]][target[1]] = unit
        target_unit.position = source
        unit.position = target
        
        # Only the initiating unit has its action consumed
        # The target unit can still act this turn
        unit.acted_this_turn = True
        # target_unit.acted_this_turn is NOT changed
        
        # Decrement actions
        self.state.players[player_id]["actions_remaining"] -= 1
        self.state.has_acted_this_turn = True
        
        if self.state.players[player_id]["actions_remaining"] <= 0:
            self._end_turn()
        
        return True, ""
    
    def _end_turn(self):
        """End the current turn and switch to the next player."""
        new_player = 1 - self.state.current_player
        
        # =========================================================
        # Increment no-progress counters (these are reset elsewhere when progress happens)
        # =========================================================
        self.turns_since_last_capture += 1
        self.turns_since_last_unit_death += 1
        
        # Calculate bonuses
        middle_bonus = 1 if self._controls_position(new_player, CONTROL_POINTS[1]) else 0
        side_control = sum(1 for p in OUTSIDE_POINTS if self._controls_position(new_player, p))
        both_sides = side_control == 2
        
        # Update new player's resources
        self.state.players[new_player]["actions_remaining"] = 1 + middle_bonus
        if both_sides:
            self.state.players[new_player]["deployments_remaining"] += 1
        
        self.state.free_deployments_remaining = 1 if side_control > 0 else 0
        
        # Reset unit action flags
        for row in range(5):
            for col in range(5):
                unit = self.state.grid[row][col]
                if unit:
                    unit.acted_this_turn = False
        
        self.state.current_player = new_player
        self.state.turn_number += 1
        self.state.has_acted_this_turn = False
    
    def _can_move(self, unit: Unit, source: Tuple[int, int], target: Tuple[int, int]) -> bool:
        """Check if a move is valid."""
        if source == target:
            return False
        
        if self.state.grid[target[0]][target[1]] is not None:
            return False
        
        stats = UNIT_STATS[unit.unit_type]
        dist = self._get_distance(source, target)
        
        return dist <= stats["move_range"]
    
    def _can_attack(self, attacker: Unit, source: Tuple[int, int], 
                    target: Tuple[int, int], defender: Unit) -> bool:
        """
        Check if an attack is valid.
        
        Rules:
        - Melee (orthogonal adjacency): Use MELEE_BEATS table
        - Ranged (Archer or Spearman, distance 2): Use RANGED_BEATS dict, Shieldman immune
        """
        stats = UNIT_STATS[attacker.unit_type]
        dist = self._get_distance(source, target)
        
        if dist > stats["attack_range"]:
            return False
        
        # Determine if melee or ranged
        manhattan_dist = abs(source[0] - target[0]) + abs(source[1] - target[1])
        is_melee = manhattan_dist == 1
        
        if not is_melee and attacker.unit_type in (UnitType.ARCHER, UnitType.SPEARMAN):
            # Ranged attack - Shieldman immune
            if defender.unit_type == UnitType.SHIELDMAN:
                return False
            # Must be in attacker's RANGED_BEATS list
            ranged_targets = RANGED_BEATS.get(attacker.unit_type, [])
            if defender.unit_type not in ranged_targets:
                return False
            # Check line of sight for ranged
            return self._has_line_of_sight(source, target)
        
        # Melee combat - check if either unit can defeat the other
        attacker_wins = defender.unit_type in MELEE_BEATS.get(attacker.unit_type, [])
        defender_wins = attacker.unit_type in MELEE_BEATS.get(defender.unit_type, [])
        
        if not attacker_wins and not defender_wins:
            return False
        
        return True
    
    def _has_line_of_sight(self, source: Tuple[int, int], target: Tuple[int, int]) -> bool:
        """Check if there's a clear line of sight between source and target."""
        dx = target[1] - source[1]
        dy = target[0] - source[0]
        adx = abs(dx)
        ady = abs(dy)
        
        # Orthogonal lines
        if adx == 0 and ady > 1:
            step = 1 if dy > 0 else -1
            for r in range(source[0] + step, target[0], step):
                if self.state.grid[r][source[1]] is not None:
                    return False
            return True
        if ady == 0 and adx > 1:
            step = 1 if dx > 0 else -1
            for c in range(source[1] + step, target[1], step):
                if self.state.grid[source[0]][c] is not None:
                    return False
            return True
        
        # Diagonal adjacency always has LOS
        if adx == 1 and ady == 1:
            return True
        
        return True  # Default allow
    
    def _can_rotate(self, unit: Unit, source: Tuple[int, int], 
                    target: Tuple[int, int], player_id: int) -> bool:
        """
        Check if a rotate is valid.
        
        Rules:
        - Any unit can do orthogonal adjacent swaps (distance 1)
        - Only Cavalry can do diagonal swaps and long rotations (distance 2)
        - Cannot swap units of the same type
        """
        target_unit = self.state.grid[target[0]][target[1]]
        if not target_unit or target_unit.owner_id != player_id:
            return False
        
        # Cannot swap units of the same type
        if unit.unit_type == target_unit.unit_type:
            return False
        
        dx = abs(target[1] - source[1])
        dy = abs(target[0] - source[0])
        is_diagonal = dx == 1 and dy == 1
        manhattan_dist = dx + dy
        
        # Orthogonal adjacent (distance 1) - any unit can do this
        if manhattan_dist == 1:
            return True
        
        # Diagonal adjacent - only cavalry
        if is_diagonal and unit.unit_type == UnitType.CAVALRY:
            return True
        
        # Long rotation (distance 2 orthogonally) - only cavalry with empty middle
        if manhattan_dist == 2 and (dx == 0 or dy == 0) and unit.unit_type == UnitType.CAVALRY:
            mid_row = (source[0] + target[0]) // 2
            mid_col = (source[1] + target[1]) // 2
            if self.state.grid[mid_row][mid_col] is None:
                return True
        
        return False
    
    def _get_distance(self, a: Tuple[int, int], b: Tuple[int, int]) -> int:
        """Calculate distance between two positions."""
        dx = abs(a[1] - b[1])
        dy = abs(a[0] - b[0])
        # Diagonal counts as 2
        if dx == 1 and dy == 1:
            return 2
        return dx + dy
    
    def _controls_position(self, player_id: int, pos: Tuple[int, int]) -> bool:
        """Check if player controls a position."""
        unit = self.state.grid[pos[0]][pos[1]]
        return unit is not None and unit.owner_id == player_id
    
    def _count_control_points(self, player_id: int) -> int:
        """Count control points held by player."""
        return sum(1 for p in CONTROL_POINTS if self._controls_position(player_id, p))
    
    def _count_units(self, player_id: int) -> int:
        """Count units owned by player."""
        count = 0
        for row in range(5):
            for col in range(5):
                unit = self.state.grid[row][col]
                if unit and unit.owner_id == player_id:
                    count += 1
        return count
    
    def _check_winner(self) -> Optional[int]:
        """Check if there's a winner. Returns player_id or None."""
        # Win by controlling all 3 control points
        for player_id in [0, 1]:
            if self._count_control_points(player_id) == 3:
                return player_id
        
        # Win by eliminating all enemy units (after turn 10 to allow setup)
        if self.state.turn_number > 10:
            for player_id in [0, 1]:
                enemy_id = 1 - player_id
                if self._count_units(enemy_id) == 0 and self._count_units(player_id) > 0:
                    return player_id
        
        return None
    
    def _encode_deploy(self, unit_type: int, col: int) -> int:
        """Encode a deploy action to action index."""
        return (unit_type - 1) * 25 + col
    
    def _encode_move(self, source: Tuple[int, int], target: Tuple[int, int]) -> int:
        """Encode a move action to action index."""
        source_idx = source[0] * 5 + source[1]
        target_idx = target[0] * 5 + target[1]
        return self.DEPLOY_ACTIONS + source_idx * 25 + target_idx
    
    def _encode_attack(self, source: Tuple[int, int], target: Tuple[int, int]) -> int:
        """Encode an attack action to action index."""
        source_idx = source[0] * 5 + source[1]
        target_idx = target[0] * 5 + target[1]
        return self.DEPLOY_ACTIONS + self.MOVE_ACTIONS + source_idx * 25 + target_idx
    
    def _encode_rotate(self, source: Tuple[int, int], target: Tuple[int, int]) -> int:
        """Encode a rotate action to action index."""
        source_idx = source[0] * 5 + source[1]
        target_idx = target[0] * 5 + target[1]
        return self.DEPLOY_ACTIONS + self.MOVE_ACTIONS + self.ATTACK_ACTIONS + source_idx * 25 + target_idx
    
    @property
    def observation_size(self) -> int:
        """Get the size of the observation vector."""
        return self.GRID_SIZE * self.GRID_SIZE * self.STATE_CHANNELS + self.GLOBAL_FEATURES
    
    @property
    def action_size(self) -> int:
        """Get the size of the action space."""
        return self.ACTION_SPACE_SIZE
    
    def clone(self) -> "NovusXEnv":
        """Create a deep copy of the environment."""
        new_env = NovusXEnv(self.config)
        new_env.state = copy.deepcopy(self.state)
        new_env.step_count = self.step_count
        new_env._unit_counter = self._unit_counter
        
        # Clone draw detection state
        new_env.state_hash_counts = copy.deepcopy(self.state_hash_counts)
        new_env.turns_since_last_capture = self.turns_since_last_capture
        new_env.turns_since_last_unit_death = self.turns_since_last_unit_death
        new_env.last_control_ownership = copy.deepcopy(self.last_control_ownership)
        new_env.game_outcome = self.game_outcome
        new_env.draw_reason = self.draw_reason
        
        return new_env
    
    def _decode_action(self, action: int) -> Dict[str, Any]:
        """
        Decode an action index into a human-readable format.
        
        Args:
            action: The action index
            
        Returns:
            Dictionary describing the action
        """
        action_type, params = self._parse_action(action)
        
        if action_type == ActionType.DEPLOY:
            unit_names = {
                UnitType.SWORDSMAN: "Swordsman",
                UnitType.SHIELDMAN: "Shieldman",
                UnitType.AXEMAN: "Axeman",
                UnitType.CAVALRY: "Cavalry",
                UnitType.ARCHER: "Archer",
                UnitType.SPEARMAN: "Spearman",
            }
            return {
                "type": "DEPLOY",
                "unit": unit_names.get(params["unit_type"], "Unknown"),
                "column": params["col"],
            }
        elif action_type == ActionType.MOVE:
            return {
                "type": "MOVE",
                "from": params["source"],
                "to": params["target"],
            }
        elif action_type == ActionType.ATTACK:
            return {
                "type": "ATTACK",
                "from": params["source"],
                "target": params["target"],
            }
        elif action_type == ActionType.ROTATE:
            return {
                "type": "ROTATE",
                "cavalry": params["source"],
                "swap_with": params["target"],
            }
        else:
            return {"type": "END_TURN"}
    
    def get_game_result(self) -> Dict[str, Any]:
        """
        Get the final game result with detailed information.
        
        Returns:
            Dictionary with game outcome details
        """
        return {
            "outcome": self.game_outcome.name,
            "is_terminal": self.game_outcome != GameOutcome.IN_PROGRESS,
            "is_draw": self.game_outcome == GameOutcome.DRAW,
            "draw_reason": self.draw_reason.name if self.draw_reason != DrawReason.NONE else None,
            "winner": 0 if self.game_outcome == GameOutcome.PLAYER_0_WIN else (
                1 if self.game_outcome == GameOutcome.PLAYER_1_WIN else None
            ),
            "turn_count": self.state.turn_number if self.state else 0,
            "step_count": self.step_count,
        }
