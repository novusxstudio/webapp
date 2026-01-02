import type { Bot } from './types';
import type { Action } from '../engine/actions';
import type { GameState, Position, Unit } from '../logic/GameState';

function findUnitById(state: GameState, unitId: string): { unit: Unit; pos: Position } | null {
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const u = state.grid[r][c].unit;
      if (u && u.id === unitId) return { unit: u, pos: { row: r + 1, col: c + 1 } };
    }
  }
  return null;
}

function findUnitAt(state: GameState, pos: Position): Unit | null {
  const tile = state.grid[pos.row - 1][pos.col - 1];
  return tile.unit;
}

function distance(a: Position, b: Position): number {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  if (dx === 1 && dy === 1) return 2;
  return dx + dy;
}

// Deterministic counter map adapted to our unit types
function counterOf(type: Unit['stats']['type']): Unit['stats']['type'] {
  // Counter mapping:
  // Archers counter Cavalry
  // Axeman counters Shieldmen
  // Shieldmen counter Archers
  // Swordsman counter Swordsman
  // Spearman counter Cavalry
  switch (type) {
    case 'Cavalry':
      return 'Archer';
    case 'Shieldman':
      return 'Axeman';
    case 'Archer':
      return 'Shieldman';
    case 'Axeman':
      return 'Swordsman';
    case 'Spearman':
      return 'Cavalry';
    case 'Swordsman':
    default:
      return 'Swordsman';
  }
}

function randomChoice<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length);
  return arr[idx];
}

function endTurnFrom(available: Action[]): Action {
  return available.find(a => a.type === 'END_TURN') ?? available[0];
}

function fallbackDeployOrEnd(available: Action[], endTurn: Action): Action {
  const deploys = available.filter((a): a is Extract<Action, { type: 'DEPLOY' }> => a.type === 'DEPLOY');
  if (deploys.length > 0) return randomChoice(deploys);
  return endTurn;
}

function resolveOpponentUnit(last: NonNullable<GameState['lastAction']>, state: GameState, playerId: 0 | 1): { unit: Unit; pos: Position } | null {
  if (last.by === playerId) return null;
  if ((last.type === 'MOVE' || last.type === 'ROTATE') && last.unitId) {
    return findUnitById(state, last.unitId);
  }
  if (last.type === 'ATTACK' && last.unitId) {
    return findUnitById(state, last.unitId);
  }
  if (last.type === 'DEPLOY' && last.to) {
    const u = findUnitAt(state, last.to);
    if (u && u.ownerId !== playerId) return { unit: u, pos: last.to };
  }
  return null;
}

function bestCounterDeploy(available: Action[], target: { unit: Unit; pos: Position }): Action | null {
  const counterType = counterOf(target.unit.stats.type);
  const options = available.filter((a): a is Extract<Action, { type: 'DEPLOY' }> => a.type === 'DEPLOY' && a.unitType === counterType);
  if (options.length === 0) return null;
  let best: { a: Action; d: number } | null = null;
  for (const a of options) {
    const d = distance(a.to, target.pos);
    if (!best || d < best.d) best = { a, d };
  }
  return best!.a;
}

function bestCounterMove(available: Action[], target: { unit: Unit; pos: Position }, state: GameState, playerId: 0 | 1): Action | null {
  const counterType = counterOf(target.unit.stats.type);
  const moves = available.filter((a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE');
  let best: { a: Action; gain: number; final: number } | null = null;
  for (const m of moves) {
    const info = findUnitById(state, m.unitId);
    if (!info) continue;
    if (info.unit.ownerId !== playerId) continue;
    if (info.unit.stats.type !== counterType) continue;
    const cur = distance(info.pos, target.pos);
    const fin = distance(m.to, target.pos);
    const gain = cur - fin;
    if (gain <= 0) continue;
    if (!best || gain > best.gain || (gain === best.gain && fin < best.final)) {
      best = { a: m, gain, final: fin };
    }
  }
  return best?.a ?? null;
}

function bestCounterRotateTowardTarget(available: Action[], target: { unit: Unit; pos: Position }, state: GameState, playerId: 0 | 1): Action | null {
  const counterType = counterOf(target.unit.stats.type);
  const rotates = available.filter((a): a is Extract<Action, { type: 'ROTATE' }> => a.type === 'ROTATE');
  let best: { a: Action; gain: number; final: number } | null = null;
  for (const r of rotates) {
    const info = findUnitById(state, r.unitId);
    if (!info) continue;
    if (info.unit.ownerId !== playerId) continue;
    if (info.unit.stats.type !== counterType) continue;
    const cur = distance(info.pos, target.pos);
    const fin = distance(r.target, target.pos);
    const gain = cur - fin;
    if (gain <= 0) continue;
    if (!best || gain > best.gain || (gain === best.gain && fin < best.final)) {
      best = { a: r, gain, final: fin };
    }
  }
  return best?.a ?? null;
}

export function createCounterBot(): Bot {
  return {
    id: 'counter_bot',
    name: 'Counter',
    decideAction({ gameState, availableActions, playerId }: { gameState: GameState; availableActions: Action[]; playerId: 0 | 1 }) {
      const endTurn = endTurnFrom(availableActions);
      const last = gameState.lastAction;
      if (!last) return fallbackDeployOrEnd(availableActions, endTurn);

      const target = resolveOpponentUnit(last, gameState, playerId);
      if (!target) return fallbackDeployOrEnd(availableActions, endTurn);

      // Global priority: if a counter-type unit can attack the target now, do it first.
      const counterType = counterOf(target.unit.stats.type);
      const counterAttack = availableActions.find((a): a is Extract<Action, { type: 'ATTACK' }> => {
        if (a.type !== 'ATTACK') return false;
        if (a.targetId !== target.unit.id) return false;
        const attacker = findUnitById(gameState, a.unitId);
        return !!attacker && attacker.unit.ownerId === playerId && attacker.unit.stats.type === counterType;
      });
      if (counterAttack) return counterAttack;

      switch (last.type) {
        case 'DEPLOY': {
          const deploy = bestCounterDeploy(availableActions, target);
          return deploy ?? fallbackDeployOrEnd(availableActions, endTurn);
        }
        case 'MOVE':
        case 'ROTATE': {
          // Attack already checked globally. Next: MOVE closer, then ROTATE closer, then deploy counter.
          const move = bestCounterMove(availableActions, target, gameState, playerId);
          if (move) return move;
          const rot = bestCounterRotateTowardTarget(availableActions, target, gameState, playerId);
          if (rot) return rot;
          const deploy = bestCounterDeploy(availableActions, target);
          return deploy ?? fallbackDeployOrEnd(availableActions, endTurn);
        }
        case 'ATTACK': {
          // Respond by MOVE closer first, then ROTATE closer; else deploy a counter near the attacker
          const move = bestCounterMove(availableActions, target, gameState, playerId);
          if (move) return move;
          const rot = bestCounterRotateTowardTarget(availableActions, target, gameState, playerId);
          if (rot) return rot;
          const deploy = bestCounterDeploy(availableActions, target);
          return deploy ?? fallbackDeployOrEnd(availableActions, endTurn);
        }
        default:
          return fallbackDeployOrEnd(availableActions, endTurn);
      }
    }
  };
}
