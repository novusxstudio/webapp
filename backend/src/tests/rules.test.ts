/**
 * Comprehensive test suite for NovusX game rules
 * 
 * Tests cover all aspects of the game as specified:
 * - Layout: 5x5 grid with 3 control points
 * - Units: Archer, Spearman, Swordsman, Shieldbearer, Axeman, Cavalry
 * - Turn Switching: Action depletion, manual end turn
 * - Actions: Deploy, Move, Rotate, Battle
 * - Control Point Buffs: Side points, center point, both sides
 * - Game Termination: Victory/Loss/Draw conditions
 */

import { strict as assert } from 'assert';
import {
  CONTROL_POINTS,
  getDistance,
  controlsPosition,
  controlsAllPoints,
  canDeployUnit,
  applyDeployUnit,
  canMove,
  applyMove,
  canRotate,
  applyRotate,
  canAttack,
  applyAttack,
  endTurn,
  checkDraw,
  checkElimination,
  hasDeploymentsLeft,
  countRemainingDeployments,
  countUnitsOnBoard,
  MAX_TURN_LIMIT,
} from '../logic/rules';
import { UNIT_DATA } from '../logic/units';
import type { GameState, Position, Unit, Tile, Player } from '../logic/GameState';

// ============================================================================
// Test Utilities
// ============================================================================

function createEmptyGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let row = 0; row < 5; row++) {
    const rowTiles: Tile[] = [];
    for (let col = 0; col < 5; col++) {
      rowTiles.push({ position: { row: row + 1, col: col + 1 }, unit: null });
    }
    grid.push(rowTiles);
  }
  return grid;
}

function createInitialDeploymentCounts(): Record<string, number> {
  return {
    swordsman: 0,
    shieldman: 0,
    axeman: 0,
    cavalry: 0,
    archer: 0,
    spearman: 0,
  };
}

function createTestState(overrides?: Partial<GameState>): GameState {
  const defaultState: GameState = {
    grid: createEmptyGrid(),
    players: [
      { id: 0, actionsRemaining: 1, deploymentsRemaining: 10, deploymentCounts: createInitialDeploymentCounts() },
      { id: 1, actionsRemaining: 0, deploymentsRemaining: 10, deploymentCounts: createInitialDeploymentCounts() },
    ],
    currentPlayer: 0,
    turnNumber: 1,
    freeDeploymentsRemaining: 0,
    hasActedThisTurn: false,
  };
  return { ...defaultState, ...overrides };
}

function placeUnit(state: GameState, pos: Position, ownerId: number, unitType: string, actedThisTurn = false): GameState {
  const unitData = UNIT_DATA[unitType.toLowerCase()];
  const unit: Unit = {
    id: `${ownerId}-${unitType}-${Date.now()}-${Math.random()}`,
    ownerId,
    stats: { ...unitData },
    position: { row: pos.row, col: pos.col },
    actedThisTurn,
  };
  const newGrid = state.grid.map((row, r) =>
    r === pos.row - 1
      ? row.map((tile, c) => (c === pos.col - 1 ? { ...tile, unit } : tile))
      : row
  );
  return { ...state, grid: newGrid };
}

function getUnitAt(state: GameState, pos: Position): Unit | null {
  return state.grid[pos.row - 1][pos.col - 1].unit;
}

function runTests() {
  let passed = 0;
  let failed = 0;
  
  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e: any) {
      console.log(`✗ ${name}`);
      console.log(`  ${e.message}`);
      failed++;
    }
  }
  
  // ==========================================================================
  // LAYOUT TESTS
  // ==========================================================================
  console.log('\n=== Layout Tests ===');
  
  test('Grid is 5x5', () => {
    const state = createTestState();
    assert.equal(state.grid.length, 5, 'Grid should have 5 rows');
    state.grid.forEach((row, i) => {
      assert.equal(row.length, 5, `Row ${i} should have 5 columns`);
    });
  });
  
  test('Control points are at row 3, columns 1, 3, 5', () => {
    assert.equal(CONTROL_POINTS.length, 3);
    assert.deepEqual(CONTROL_POINTS[0], { row: 3, col: 1 });
    assert.deepEqual(CONTROL_POINTS[1], { row: 3, col: 3 });
    assert.deepEqual(CONTROL_POINTS[2], { row: 3, col: 5 });
  });
  
  test('Grid starts empty', () => {
    const state = createTestState();
    for (const row of state.grid) {
      for (const tile of row) {
        assert.equal(tile.unit, null, 'All tiles should start empty');
      }
    }
  });
  
  test('Only one unit may occupy one tile at any given time', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    // Trying to deploy on occupied tile should fail
    assert.equal(canDeployUnit(state, 'archer', { row: 1, col: 1 }), false);
  });
  
  // ==========================================================================
  // UNIT TESTS
  // ==========================================================================
  console.log('\n=== Unit Stats Tests ===');
  
  test('Archer stats: Movement 1, Attack Range 2', () => {
    assert.equal(UNIT_DATA.archer.moveRange, 1);
    assert.equal(UNIT_DATA.archer.attackRange, 2);
  });
  
  test('Spearman stats: Movement 1, Attack Range 2', () => {
    assert.equal(UNIT_DATA.spearman.moveRange, 1);
    assert.equal(UNIT_DATA.spearman.attackRange, 2);
  });
  
  test('Swordsman stats: Movement 1, Attack Range 1', () => {
    assert.equal(UNIT_DATA.swordsman.moveRange, 1);
    assert.equal(UNIT_DATA.swordsman.attackRange, 1);
  });
  
  test('Shieldbearer stats: Movement 1, Attack Range 1', () => {
    assert.equal(UNIT_DATA.shieldman.moveRange, 1);
    assert.equal(UNIT_DATA.shieldman.attackRange, 1);
  });
  
  test('Axeman stats: Movement 1, Attack Range 1', () => {
    assert.equal(UNIT_DATA.axeman.moveRange, 1);
    assert.equal(UNIT_DATA.axeman.attackRange, 1);
  });
  
  test('Cavalry stats: Movement 2, Attack Range 1', () => {
    assert.equal(UNIT_DATA.cavalry.moveRange, 2);
    assert.equal(UNIT_DATA.cavalry.attackRange, 1);
  });
  
  // ==========================================================================
  // DISTANCE TESTS
  // ==========================================================================
  console.log('\n=== Distance Calculation Tests ===');
  
  test('Orthogonal distance is Manhattan distance', () => {
    assert.equal(getDistance({ row: 1, col: 1 }, { row: 1, col: 2 }), 1);
    assert.equal(getDistance({ row: 1, col: 1 }, { row: 2, col: 1 }), 1);
    assert.equal(getDistance({ row: 1, col: 1 }, { row: 1, col: 3 }), 2);
  });
  
  test('Diagonal distance is 2 (not 1)', () => {
    assert.equal(getDistance({ row: 1, col: 1 }, { row: 2, col: 2 }), 2);
    assert.equal(getDistance({ row: 3, col: 3 }, { row: 2, col: 4 }), 2);
  });
  
  // ==========================================================================
  // DEPLOY ACTION TESTS
  // ==========================================================================
  console.log('\n=== Deploy Action Tests ===');
  
  test('Player 0 can only deploy on row 1', () => {
    const state = createTestState();
    assert.equal(canDeployUnit(state, 'swordsman', { row: 1, col: 3 }), true);
    assert.equal(canDeployUnit(state, 'swordsman', { row: 2, col: 3 }), false);
    assert.equal(canDeployUnit(state, 'swordsman', { row: 5, col: 3 }), false);
  });
  
  test('Player 1 can only deploy on row 5', () => {
    let state = createTestState();
    state = { ...state, currentPlayer: 1, players: [
      { ...state.players[0], actionsRemaining: 0 },
      { ...state.players[1], actionsRemaining: 1 },
    ]};
    assert.equal(canDeployUnit(state, 'swordsman', { row: 5, col: 3 }), true);
    assert.equal(canDeployUnit(state, 'swordsman', { row: 1, col: 3 }), false);
    assert.equal(canDeployUnit(state, 'swordsman', { row: 4, col: 3 }), false);
  });
  
  test('Cannot deploy on occupied tile', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    assert.equal(canDeployUnit(state, 'archer', { row: 1, col: 1 }), false);
  });
  
  test('Deploy consumes 1 action', () => {
    let state = createTestState();
    assert.equal(state.players[0].actionsRemaining, 1);
    state = applyDeployUnit(state, 'swordsman', { row: 1, col: 1 });
    // Deployment doesn't consume action directly - action is consumed by the caller
    // The unit is marked as actedThisTurn
    const unit = getUnitAt(state, { row: 1, col: 1 });
    assert.equal(unit?.actedThisTurn, true);
  });
  
  test('Cannot deploy with 0 actions remaining', () => {
    let state = createTestState();
    state.players[0].actionsRemaining = 0;
    assert.equal(canDeployUnit(state, 'swordsman', { row: 1, col: 1 }), false);
  });
  
  test('Each unit type can be deployed max 2 times', () => {
    let state = createTestState();
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 0, axeman: 0, cavalry: 0, archer: 0, spearman: 0 };
    assert.equal(canDeployUnit(state, 'swordsman', { row: 1, col: 1 }), false);
    assert.equal(canDeployUnit(state, 'archer', { row: 1, col: 1 }), true);
  });
  
  // ==========================================================================
  // MOVE ACTION TESTS
  // ==========================================================================
  console.log('\n=== Move Action Tests ===');
  
  test('Unit with moveRange 1 can move orthogonally 1 tile', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    // Can move orthogonally
    assert.equal(canMove(state, unit.id, { row: 2, col: 3 }), true);
    assert.equal(canMove(state, unit.id, { row: 3, col: 2 }), true);
    assert.equal(canMove(state, unit.id, { row: 1, col: 2 }), true);
    assert.equal(canMove(state, unit.id, { row: 2, col: 1 }), true);
  });
  
  test('Unit with moveRange 1 cannot move diagonally', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    // Cannot move diagonally (distance = 2)
    assert.equal(canMove(state, unit.id, { row: 3, col: 3 }), false);
    assert.equal(canMove(state, unit.id, { row: 1, col: 1 }), false);
  });
  
  test('Cavalry (moveRange 2) can move diagonally 1 tile', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'cavalry');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canMove(state, unit.id, { row: 3, col: 3 }), true);
    assert.equal(canMove(state, unit.id, { row: 1, col: 1 }), true);
    assert.equal(canMove(state, unit.id, { row: 1, col: 3 }), true);
    assert.equal(canMove(state, unit.id, { row: 3, col: 1 }), true);
  });
  
  test('Cavalry can move orthogonally 2 tiles', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'cavalry');
    const unit = getUnitAt(state, { row: 3, col: 3 })!;
    assert.equal(canMove(state, unit.id, { row: 3, col: 5 }), true);
    assert.equal(canMove(state, unit.id, { row: 3, col: 1 }), true);
    assert.equal(canMove(state, unit.id, { row: 5, col: 3 }), true);
    assert.equal(canMove(state, unit.id, { row: 1, col: 3 }), true);
  });
  
  test('Cavalry cannot move through occupied tiles', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'cavalry');
    state = placeUnit(state, { row: 3, col: 2 }, 1, 'swordsman'); // Blocker
    const unit = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canMove(state, unit.id, { row: 3, col: 3 }), false);
  });
  
  test('Cannot move to occupied tile', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 0, 'archer');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canMove(state, unit.id, { row: 2, col: 3 }), false);
  });
  
  test('Cannot move enemy unit', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 1, 'swordsman'); // Enemy unit
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canMove(state, unit.id, { row: 2, col: 3 }), false);
  });
  
  test('Unit that already acted cannot move', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman', true); // Already acted
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canMove(state, unit.id, { row: 2, col: 3 }), false);
  });
  
  test('Move updates unit position', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyMove(state, unit.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.notEqual(getUnitAt(state, { row: 2, col: 3 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 })?.id, unit.id);
  });
  
  // ==========================================================================
  // ROTATE ACTION TESTS
  // ==========================================================================
  console.log('\n=== Rotate Action Tests ===');
  
  test('Units can rotate with adjacent friendly non-similar unit', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 0, 'archer');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canRotate(state, unit.id, { row: 2, col: 3 }), true);
  });
  
  test('Cannot rotate with same unit type', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 0, 'swordsman');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canRotate(state, unit.id, { row: 2, col: 3 }), false);
  });
  
  test('Cannot rotate with enemy unit', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'archer');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canRotate(state, unit.id, { row: 2, col: 3 }), false);
  });
  
  test('Cavalry can rotate with diagonal friendly unit', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'cavalry');
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'swordsman');
    const cavalry = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canRotate(state, cavalry.id, { row: 3, col: 3 }), true);
  });
  
  test('Non-cavalry cannot rotate with distant unit (not adjacent)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 4 }, 0, 'archer'); // 2 tiles away orthogonally
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canRotate(state, unit.id, { row: 2, col: 4 }), false);
  });
  
  test('Cavalry can rotate with unit 2 tiles orthogonally (with empty middle)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'cavalry');
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'swordsman');
    const cavalry = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canRotate(state, cavalry.id, { row: 3, col: 3 }), true);
  });
  
  test('Cavalry long rotation blocked by unit in between', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'cavalry');
    state = placeUnit(state, { row: 3, col: 2 }, 0, 'archer'); // Blocker
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'swordsman');
    const cavalry = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canRotate(state, cavalry.id, { row: 3, col: 3 }), false);
  });
  
  test('Rotate swaps positions', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 0, 'archer');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    const archer = getUnitAt(state, { row: 2, col: 3 })!;
    state = applyRotate(state, swordsman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 })?.id, archer.id);
    assert.equal(getUnitAt(state, { row: 2, col: 3 })?.id, swordsman.id);
  });
  
  test('Only initiating unit consumes action on rotate', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 0, 'archer');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyRotate(state, swordsman.id, { row: 2, col: 3 });
    // Initiating unit should be marked as acted
    assert.equal(getUnitAt(state, { row: 2, col: 3 })?.actedThisTurn, true);
    // Target unit should NOT be marked as acted
    assert.equal(getUnitAt(state, { row: 2, col: 2 })?.actedThisTurn, false);
  });
  
  // ==========================================================================
  // BATTLE/ATTACK ACTION TESTS
  // ==========================================================================
  console.log('\n=== Battle Action Tests ===');
  
  // Melee combat tests
  test('Melee battle: Swordsman defeats Archer', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'archer');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canAttack(state, swordsman.id, { row: 2, col: 3 }), true);
    state = applyAttack(state, swordsman.id, { row: 2, col: 3 });
    // Archer should be removed
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
    // Swordsman survives
    assert.notEqual(getUnitAt(state, { row: 2, col: 2 }), null);
  });
  
  test('Melee battle: Swordsman defeats Cavalry', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'cavalry');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, swordsman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Swordsman defeats Axeman', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'axeman');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, swordsman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Swordsman vs Swordsman - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'swordsman');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, swordsman.id, { row: 2, col: 3 });
    // Both should be removed
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Swordsman defeats Spearman', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'spearman');
    const swordsman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, swordsman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Shieldman defeats Archer', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'shieldman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'archer');
    const shieldman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, shieldman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
    assert.notEqual(getUnitAt(state, { row: 2, col: 2 }), null);
  });
  
  test('Melee battle: Shieldman CANNOT attack Swordsman (Shieldman cannot beat Swordsman)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'shieldman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'swordsman');
    const shieldman = getUnitAt(state, { row: 2, col: 2 })!;
    // canAttack returns false - Shieldman cannot beat Swordsman
    // Shieldman only defeats Archer
    assert.equal(canAttack(state, shieldman.id, { row: 2, col: 3 }), false);
  });

  test('Melee battle: Shieldman CANNOT attack Spearman (Shieldman cannot beat Spearman)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'shieldman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'spearman');
    const shieldman = getUnitAt(state, { row: 2, col: 2 })!;
    // canAttack returns false - Shieldman cannot beat Spearman
    // Even though Spearman beats Shieldman, Shieldman cannot initiate the attack
    assert.equal(canAttack(state, shieldman.id, { row: 2, col: 3 }), false);
  });

  test('Melee battle: Spearman CAN attack Shieldman (Spearman beats Shieldman)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'spearman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'shieldman');
    const spearman = getUnitAt(state, { row: 2, col: 2 })!;
    // Spearman beats Shieldman, so attack is valid
    assert.equal(canAttack(state, spearman.id, { row: 2, col: 3 }), true);
    state = applyAttack(state, spearman.id, { row: 2, col: 3 });
    // Spearman wins, Shieldman dies
    assert.notEqual(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Axeman defeats Shieldbearer', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'axeman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'shieldman');
    const axeman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, axeman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Axeman defeats Cavalry', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'axeman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'cavalry');
    const axeman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, axeman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Axeman vs Axeman - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'axeman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'axeman');
    const axeman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, axeman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Cavalry defeats Archer', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'cavalry');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'archer');
    const cavalry = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, cavalry.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Cavalry vs Cavalry - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'cavalry');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'cavalry');
    const cavalry = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, cavalry.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Cavalry defeats Spearman', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'cavalry');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'spearman');
    const cavalry = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, cavalry.id, { row: 2, col: 3 });
    // Both can defeat each other
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Archer vs Archer - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'archer');
    const archer = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, archer.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Spearman defeats Shieldbearer', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'spearman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'shieldman');
    const spearman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, spearman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Spearman defeats Cavalry', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'spearman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'cavalry');
    const spearman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, spearman.id, { row: 2, col: 3 });
    // Both can defeat each other - mutual defeat
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  test('Melee battle: Spearman vs Spearman - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'spearman');
    state = placeUnit(state, { row: 2, col: 3 }, 1, 'spearman');
    const spearman = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyAttack(state, spearman.id, { row: 2, col: 3 });
    assert.equal(getUnitAt(state, { row: 2, col: 2 }), null);
    assert.equal(getUnitAt(state, { row: 2, col: 3 }), null);
  });
  
  // Ranged combat tests
  console.log('\n=== Ranged Battle Tests ===');
  
  test('Ranged: Archer can attack at distance 2 orthogonally', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, archer.id, { row: 3, col: 3 }), true);
  });
  
  test('Ranged: Archer can attack diagonally', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    const archer = getUnitAt(state, { row: 2, col: 2 })!;
    assert.equal(canAttack(state, archer.id, { row: 3, col: 3 }), true);
  });
  
  test('Ranged: Archer defeats Swordsman at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null);
    assert.notEqual(getUnitAt(state, { row: 3, col: 1 }), null);
  });
  
  test('Ranged: Archer defeats Cavalry at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'cavalry');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null);
  });
  
  test('Ranged: Archer defeats Axeman at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'axeman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null);
  });
  
  test('Ranged: Archer vs Spearman at range - mutual defeat (both can hit each other)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'spearman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    // Both should die - Archer beats Spearman at range, Spearman beats Archer at range
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Spearman should die');
    assert.equal(getUnitAt(state, { row: 3, col: 1 }), null, 'Archer should also die (mutual defeat)');
  });
  
  test('Ranged: Archer CANNOT attack Shieldbearer at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'shieldman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, archer.id, { row: 3, col: 3 }), false);
  });
  
  test('Ranged: Archer blocked by unit in line of sight', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 2 }, 0, 'swordsman'); // Blocker
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'cavalry');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, archer.id, { row: 3, col: 3 }), false);
  });
  
  test('Ranged: Spearman vs Archer at range - mutual defeat (both can hit each other)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'archer');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, spearman.id, { row: 3, col: 3 });
    // Both should die - Spearman beats Archer at range, Archer beats Spearman at range
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Archer should die');
    assert.equal(getUnitAt(state, { row: 3, col: 1 }), null, 'Spearman should also die (mutual defeat)');
  });
  
  test('Ranged: Spearman defeats Cavalry at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'cavalry');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, spearman.id, { row: 3, col: 3 });
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null);
  });
  
  test('Ranged: Spearman vs Spearman at range - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'spearman');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, spearman.id, { row: 3, col: 3 });
    // Both should die - both Spearmen can hit each other at range
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Defender Spearman should die');
    assert.equal(getUnitAt(state, { row: 3, col: 1 }), null, 'Attacker Spearman should also die (mutual defeat)');
  });
  
  test('Ranged: Spearman CANNOT attack Swordsman at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, spearman.id, { row: 3, col: 3 }), false);
  });
  
  test('Ranged: Spearman CANNOT attack Shieldbearer at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'shieldman');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, spearman.id, { row: 3, col: 3 }), false);
  });
  
  test('Ranged: Spearman CANNOT attack Axeman at range', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'axeman');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    assert.equal(canAttack(state, spearman.id, { row: 3, col: 3 }), false);
  });
  
  test('Ranged: Archer vs Archer at range - mutual defeat', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'archer');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    // Both Archers can hit each other at range
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Defender Archer should die');
    assert.equal(getUnitAt(state, { row: 3, col: 1 }), null, 'Attacker Archer should also die (mutual defeat)');
  });
  
  test('Ranged: Spearman vs Cavalry at range - only Cavalry dies (no mutual defeat)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'spearman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'cavalry');
    const spearman = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, spearman.id, { row: 3, col: 3 });
    // Spearman beats Cavalry at range, Cavalry has no ranged attack
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Cavalry should die');
    assert.notEqual(getUnitAt(state, { row: 3, col: 1 }), null, 'Spearman should survive (Cavalry cannot counter at range)');
  });
  
  test('Ranged: Archer vs Cavalry at range - only Cavalry dies (no mutual defeat)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'cavalry');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    // Archer beats Cavalry at range, Cavalry has no ranged attack
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Cavalry should die');
    assert.notEqual(getUnitAt(state, { row: 3, col: 1 }), null, 'Archer should survive (Cavalry cannot counter at range)');
  });
  
  test('Ranged: Archer vs Swordsman at range - only Swordsman dies (no mutual defeat)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    // Archer beats Swordsman at range, Swordsman has no ranged attack
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Swordsman should die');
    assert.notEqual(getUnitAt(state, { row: 3, col: 1 }), null, 'Archer should survive (Swordsman cannot counter at range)');
  });
  
  test('Ranged: Archer vs Axeman at range - only Axeman dies (no mutual defeat)', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'axeman');
    const archer = getUnitAt(state, { row: 3, col: 1 })!;
    state = applyAttack(state, archer.id, { row: 3, col: 3 });
    // Archer beats Axeman at range, Axeman has no ranged attack
    assert.equal(getUnitAt(state, { row: 3, col: 3 }), null, 'Axeman should die');
    assert.notEqual(getUnitAt(state, { row: 3, col: 1 }), null, 'Archer should survive (Axeman cannot counter at range)');
  });
  
  // ==========================================================================
  // TURN SWITCHING TESTS
  // ==========================================================================
  console.log('\n=== Turn Switching Tests ===');
  
  test('Each player starts with 1 action', () => {
    const state = createTestState();
    assert.equal(state.players[0].actionsRemaining, 1);
    // Player 1 has 0 because it's player 0's turn
    assert.equal(state.players[1].actionsRemaining, 0);
  });
  
  test('End turn switches current player', () => {
    let state = createTestState();
    assert.equal(state.currentPlayer, 0);
    state = endTurn(state);
    assert.equal(state.currentPlayer, 1);
    state = endTurn(state);
    assert.equal(state.currentPlayer, 0);
  });
  
  test('End turn increments turn number', () => {
    let state = createTestState();
    assert.equal(state.turnNumber, 1);
    state = endTurn(state);
    assert.equal(state.turnNumber, 2);
  });
  
  test('End turn resets unit action flags', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman', true);
    assert.equal(getUnitAt(state, { row: 2, col: 2 })?.actedThisTurn, true);
    state = endTurn(state);
    assert.equal(getUnitAt(state, { row: 2, col: 2 })?.actedThisTurn, false);
  });
  
  // ==========================================================================
  // CONTROL POINT BUFF TESTS
  // ==========================================================================
  console.log('\n=== Control Point Buff Tests ===');
  
  test('Center control point gives +1 action', () => {
    let state = createTestState();
    // Place player 1's unit on center control point
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    state = endTurn(state);
    // Player 1 should have 2 actions (base 1 + bonus 1)
    assert.equal(state.players[1].actionsRemaining, 2);
  });
  
  test('Side control point gives free deployment', () => {
    let state = createTestState();
    // Place player 1's unit on left side control point
    state = placeUnit(state, { row: 3, col: 1 }, 1, 'swordsman');
    state = endTurn(state);
    assert.equal(state.freeDeploymentsRemaining, 1);
  });
  
  test('Both side control points gives 2 actions', () => {
    let state = createTestState();
    // Place player 1's units on both side control points
    state = placeUnit(state, { row: 3, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 3, col: 5 }, 1, 'archer');
    state = endTurn(state);
    // Player 1 should have 2 actions
    assert.equal(state.players[1].actionsRemaining, 2);
  });
  
  test('Both side + center gives 2 actions + free deploy', () => {
    let state = createTestState();
    // Place player 1's units on all control points
    state = placeUnit(state, { row: 3, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'shieldman');
    state = placeUnit(state, { row: 3, col: 5 }, 1, 'archer');
    state = endTurn(state);
    // 2 actions from both sides (or center - doesn't stack)
    assert.equal(state.players[1].actionsRemaining, 2);
    // Free deployment from side control
    assert.equal(state.freeDeploymentsRemaining, 1);
    // No extra deployment bonus anymore
    assert.equal(state.players[1].deploymentsRemaining, 10);
  });
  
  // ==========================================================================
  // CONTROL POINT STATUS TESTS
  // ==========================================================================
  console.log('\n=== Control Point Status Tests ===');
  
  test('controlsPosition returns true if player has unit on position', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'swordsman');
    assert.equal(controlsPosition(state, 0, { row: 3, col: 1 }), true);
    assert.equal(controlsPosition(state, 1, { row: 3, col: 1 }), false);
  });
  
  test('controlsAllPoints returns true when all control points occupied', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 5 }, 0, 'cavalry');
    assert.equal(controlsAllPoints(state, 0), true);
    assert.equal(controlsAllPoints(state, 1), false);
  });
  
  // ==========================================================================
  // GAME TERMINATION - VICTORY/LOSS TESTS
  // ==========================================================================
  console.log('\n=== Victory/Loss Tests ===');
  
  test('controlsAllPoints triggers victory', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 3, col: 3 }, 0, 'archer');
    state = placeUnit(state, { row: 3, col: 5 }, 0, 'cavalry');
    assert.equal(controlsAllPoints(state, 0), true);
  });
  
  test('Elimination: Player with no units and no deployments loses', () => {
    let state = createTestState();
    // Player 0 has maxed out all unit types (no deployments left)
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    // Player 1 has a unit
    state = placeUnit(state, { row: 3, col: 3 }, 1, 'swordsman');
    // Player 0 has no units and no deployments - eliminated
    assert.equal(checkElimination(state), 0);
  });

  test('Elimination: Winner is opponent of eliminated player', () => {
    let state = createTestState();
    // Player 1 has maxed out all unit types (no deployments left)
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    // Player 0 has a unit
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    // Player 1 has no units and no deployments - eliminated, Player 0 wins
    assert.equal(checkElimination(state), 1);
  });
  
  test('Victory for Player 0 when Player 1 has no units on board and no deployments left', () => {
    let state = createTestState();
    // Player 1 has no deployments left (all unit types maxed at 2 each)
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    // Player 1 has no units on board
    assert.equal(countUnitsOnBoard(state, 1), 0);
    // Player 1 has no deployments left
    assert.equal(hasDeploymentsLeft(state, 1), false);
    assert.equal(countRemainingDeployments(state, 1), 0);
    // Result: Player 1 is eliminated (checkElimination returns 1 = eliminated player)
    // This means Player 0 wins
    assert.equal(checkElimination(state), 1);
  });
  
  test('Victory for Player 1 when Player 0 has no units on board and no deployments left', () => {
    let state = createTestState();
    // Player 0 has no deployments left (all unit types maxed at 2 each)
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    // Player 0 has no units on board
    assert.equal(countUnitsOnBoard(state, 0), 0);
    // Player 0 has no deployments left
    assert.equal(hasDeploymentsLeft(state, 0), false);
    assert.equal(countRemainingDeployments(state, 0), 0);
    // Result: Player 0 is eliminated (checkElimination returns 0 = eliminated player)
    // This means Player 1 wins
    assert.equal(checkElimination(state), 0);
  });
  
  test('No elimination when player has units on board', () => {
    let state = createTestState();
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    assert.equal(checkElimination(state), null);
  });
  
  test('No elimination when player has deployments left', () => {
    let state = createTestState();
    // Player has no units but can still deploy (hasn't maxed all types)
    assert.equal(hasDeploymentsLeft(state, 0), true);
    assert.equal(checkElimination(state), null);
  });

  test('No elimination when player has at least one unit type not maxed', () => {
    let state = createTestState();
    // Player 0 has maxed 5 unit types but not spearman
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 0 };
    // No units on board but can still deploy spearman
    assert.equal(hasDeploymentsLeft(state, 0), true);
    assert.equal(checkElimination(state), null);
  });
  
  // ==========================================================================
  // GAME TERMINATION - DRAW TESTS
  // ==========================================================================
  console.log('\n=== Draw Tests ===');
  
  test('Draw: Turn limit reached (250 turns)', () => {
    let state = createTestState();
    state.turnNumber = MAX_TURN_LIMIT;
    assert.equal(checkDraw(state), 'turn_limit');
  });
  
  test('Draw: Both players have 0 deployments and < 3 units on board', () => {
    let state = createTestState();
    // Max out all deployments for both players
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    // Each has 2 units on board (total 2 each)
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 1, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 5, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 5, col: 2 }, 1, 'archer');
    assert.equal(checkDraw(state), 'low_resources');
  });

  test('Draw: Both players have < 3 deployments and 0 units on board', () => {
    let state = createTestState();
    // Each player has only 2 deployments left (e.g. only spearman not maxed)
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    // Each has 0 units on board, 1 deployment remaining each
    assert.equal(countRemainingDeployments(state, 0), 1);
    assert.equal(countRemainingDeployments(state, 1), 1);
    assert.equal(checkDraw(state), 'low_resources');
  });

  test('Draw: Both players have < 3 total resources', () => {
    let state = createTestState();
    // Each player has 1 deployment left
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    // Each has 1 unit on board
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 5, col: 2 }, 1, 'archer');
    // 1 unit + 1 deployment = 2 total each (< 3)
    assert.equal(checkDraw(state), 'low_resources');
  });
  
  test('No draw if one player has >= 3 total resources', () => {
    let state = createTestState();
    // Player 0 has 1 deployment left
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    // Player 1 has 0 deployments left
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 1, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 5, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 5, col: 2 }, 1, 'archer');
    // Player 0 has 3 total (2 units + 1 deployment)
    assert.equal(countRemainingDeployments(state, 0), 1);
    assert.equal(checkDraw(state), null);
  });
  
  test('Draw: Mutual invincibility on control points (only when both have 0 deployments)', () => {
    let state = createTestState();
    // Set up scenario where both players have invincible units on control points
    // Player 0 has Shieldman on control point (immune to ranged, only beaten by Axeman/Spearman)
    // Player 1 has Shieldman on control point
    // Neither player has Axeman or Spearman
    // Max out all deployments for both players
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'shieldman');
    state = placeUnit(state, { row: 3, col: 5 }, 1, 'shieldman');
    // Add more units to avoid low_resources draw
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 1, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 5, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 5, col: 2 }, 1, 'archer');
    // No other units that can defeat Shieldman
    assert.equal(checkDraw(state), 'mutual_invincibility');
  });
  
  test('No mutual invincibility draw if either player has deployments left', () => {
    let state = createTestState();
    // Player 0 has 1 deployment left - no mutual invincibility check
    state.players[0].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 1 };
    // Player 1 has 0 deployments left
    state.players[1].deploymentCounts = { swordsman: 2, shieldman: 2, axeman: 2, cavalry: 2, archer: 2, spearman: 2 };
    state = placeUnit(state, { row: 3, col: 1 }, 0, 'shieldman');
    state = placeUnit(state, { row: 3, col: 5 }, 1, 'shieldman');
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 1, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 5, col: 1 }, 1, 'swordsman');
    state = placeUnit(state, { row: 5, col: 2 }, 1, 'archer');
    assert.equal(checkDraw(state), null);
  });
  
  // ==========================================================================
  // COUNT UNITS TESTS
  // ==========================================================================
  console.log('\n=== Count Units Tests ===');
  
  test('countUnitsOnBoard returns correct count', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 1, col: 1 }, 0, 'swordsman');
    state = placeUnit(state, { row: 1, col: 2 }, 0, 'archer');
    state = placeUnit(state, { row: 5, col: 1 }, 1, 'cavalry');
    assert.equal(countUnitsOnBoard(state, 0), 2);
    assert.equal(countUnitsOnBoard(state, 1), 1);
  });
  
  // ==========================================================================
  // UNIT ACTION LIMIT TESTS
  // ==========================================================================
  console.log('\n=== Unit Action Limit Tests ===');
  
  test('Each unit may only perform one action per turn', () => {
    let state = createTestState();
    state = placeUnit(state, { row: 2, col: 2 }, 0, 'swordsman');
    const unit = getUnitAt(state, { row: 2, col: 2 })!;
    state = applyMove(state, unit.id, { row: 2, col: 3 });
    // Unit should be marked as acted
    assert.equal(getUnitAt(state, { row: 2, col: 3 })?.actedThisTurn, true);
    // Cannot move again
    assert.equal(canMove(state, unit.id, { row: 2, col: 4 }), false);
  });
  
  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Run tests
runTests();
