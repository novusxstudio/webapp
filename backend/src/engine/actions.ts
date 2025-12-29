import type { GameState, Position, Unit } from '../logic/GameState';
import { canMove, canAttack, applyMove, applyAttack, endTurn } from '../logic/rules';

export type PlayerID = 0 | 1;

// TileId represented as Position for simplicity and serialization
export type TileId = Position;

export type Action =
  | { type: 'MOVE'; unitId: string; to: TileId }
  | { type: 'ATTACK'; unitId: string; targetId: string }
  | { type: 'END_TURN' };

function isCurrentPlayersUnit(state: GameState, unit: Unit): boolean {
  return unit.ownerId === state.currentPlayer;
}

function findUnitById(state: GameState, unitId: string): { unit: Unit; pos: Position } | null {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.id === unitId) {
        return { unit: u, pos: { row: r + 1, col: c + 1 } };
      }
    }
  }
  return null;
}

function findAllUnits(state: GameState, ownerId: number): Array<{ unit: Unit; pos: Position }> {
  const list: Array<{ unit: Unit; pos: Position }> = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.ownerId === ownerId) list.push({ unit: u, pos: { row: r + 1, col: c + 1 } });
    }
  }
  return list;
}

function equalsAction(a: Action, b: Action): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'MOVE':
      return (
        b.type === 'MOVE' &&
        a.unitId === b.unitId &&
        a.to.row === b.to.row &&
        a.to.col === b.to.col
      );
    case 'ATTACK':
      return b.type === 'ATTACK' && a.unitId === b.unitId && a.targetId === b.targetId;
    case 'END_TURN':
      return true;
  }
}

export function getAvailableActions(state: GameState, playerId: PlayerID): Action[] {
  const actions: Action[] = [];
  if (state.currentPlayer !== playerId) {
    // Only end turn is conceptually allowed, but disallow when not your turn
    return actions;
  }

  // Generate moves
  const myUnits = findAllUnits(state, playerId);
  for (const { unit } of myUnits) {
    // Try all board tiles as destinations
    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 5; c++) {
        const to: Position = { row: r, col: c };
        if (canMove(state, unit.id, to)) {
          actions.push({ type: 'MOVE', unitId: unit.id, to });
        }
      }
    }
  }

  // Generate attacks
  for (const { unit } of myUnits) {
    // Consider all tiles that currently have an enemy unit
    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 5; c++) {
        const tile = state.grid[r - 1][c - 1];
        const defender = tile.unit;
        if (defender && defender.ownerId !== playerId) {
          const targetPos: Position = { row: r, col: c };
          if (canAttack(state, unit.id, targetPos)) {
            actions.push({ type: 'ATTACK', unitId: unit.id, targetId: defender.id });
          }
        }
      }
    }
  }

  // End turn always available when it's your turn
  actions.push({ type: 'END_TURN' });
  return actions;
}

export function validateAction(state: GameState, action: Action): boolean {
  if (action.type === 'END_TURN') return state.players[state.currentPlayer].actionsRemaining >= 0;
  if (action.type === 'MOVE') {
    return !!findUnitById(state, action.unitId) && canMove(state, action.unitId, action.to);
  }
  if (action.type === 'ATTACK') {
    const info = findUnitById(state, action.unitId);
    if (!info) return false;
    // ensure targetId exists at some position
    let targetPos: Position | null = null;
    for (let r = 1; r <= 5; r++) {
      for (let c = 1; c <= 5; c++) {
        const u = state.grid[r - 1][c - 1].unit;
        if (u && u.id === action.targetId) { targetPos = { row: r, col: c }; break; }
      }
      if (targetPos) break;
    }
    return !!targetPos && canAttack(state, action.unitId, targetPos);
  }
  return false;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (!validateAction(state, action)) {
    throw new Error('Illegal action');
  }
  switch (action.type) {
    case 'MOVE':
      return applyMove(state, action.unitId, action.to);
    case 'ATTACK': {
      // resolve targetId to position
      let targetPos: Position | null = null;
      for (let r = 1; r <= 5; r++) {
        for (let c = 1; c <= 5; c++) {
          const u = state.grid[r - 1][c - 1].unit;
          if (u && u.id === action.targetId) { targetPos = { row: r, col: c }; break; }
        }
        if (targetPos) break;
      }
      if (!targetPos) throw new Error('Target not found');
      return applyAttack(state, action.unitId, targetPos);
    }
    case 'END_TURN':
      return endTurn(state);
  }
}

export function includesAction(actions: Action[], candidate: Action): boolean {
  return actions.some(a => equalsAction(a, candidate));
}
