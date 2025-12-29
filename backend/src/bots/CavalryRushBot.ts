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

function isCavalryUnit(state: GameState, unitId: string): boolean {
  const info = findUnitById(state, unitId);
  return !!info && info.unit.stats.type === 'Cavalry';
}

function isForwardMove(action: Extract<Action, { type: 'MOVE' }>, state: GameState, playerId: 0 | 1): boolean {
  const info = findUnitById(state, action.unitId);
  if (!info) return false;
  if (playerId === 0) return action.to.row > info.pos.row;
  return action.to.row < info.pos.row;
}

function pickMostForward(moves: Array<Extract<Action, { type: 'MOVE' }>>, state: GameState, playerId: 0 | 1): Action {
  // Choose move with most advanced target row; tie-break by greater distance
  return moves.sort((a, b) => {
    if (playerId === 0) {
      const dr = b.to.row - a.to.row;
      if (dr !== 0) return dr;
      return (b.to.col - a.to.col);
    } else {
      const dr = a.to.row - b.to.row;
      if (dr !== 0) return dr;
      return (a.to.col - b.to.col);
    }
  })[0];
}

export function createCavalryRushBot(): Bot {
  let priority: 'DEPLOY' | 'MOVE' = 'DEPLOY';
  let lastTurnNumber: number = -1;
  const movedCavalryThisTurn = new Set<string>();
  return {
    id: 'cavalry_rush_bot',
    name: 'Cavalry Rush',
    decideAction({ availableActions, gameState, playerId }: { availableActions: Action[]; gameState: GameState; playerId: 0 | 1 }) {
      // Reset per-turn memory when a new turn starts
      if (gameState.turnNumber !== lastTurnNumber) {
        lastTurnNumber = gameState.turnNumber;
        movedCavalryThisTurn.clear();
      }
      const tryDeploy = (): Action | null => {
        const deploy = availableActions.find(
          (a): a is Extract<Action, { type: 'DEPLOY' }> => a.type === 'DEPLOY' && a.unitType === 'Cavalry'
        );
        if (deploy) return deploy;
        priority = 'MOVE';
        return null;
      };

      const tryMove = (): Action | null => {
        const moves = availableActions.filter(
          (a): a is Extract<Action, { type: 'MOVE' }> => a.type === 'MOVE' && isCavalryUnit(gameState, a.unitId)
        );
        if (moves.length === 0) { priority = 'DEPLOY'; return null; }

        const forwardMoves = moves.filter(m => isForwardMove(m, gameState, playerId));

        const orderUnitIdsByBehind = (unitIds: string[]): string[] => {
          return [...unitIds].sort((ua, ub) => {
            const a = findUnitById(gameState, ua)!;
            const b = findUnitById(gameState, ub)!;
            if (playerId === 0) {
              // smaller row = more behind
              return a.pos.row - b.pos.row;
            } else {
              // larger row = more behind (since forward is up)
              return b.pos.row - a.pos.row;
            }
          });
        };

        const pickForMostBehind = (candidateMoves: Array<Extract<Action, { type: 'MOVE' }>>): Action | null => {
          if (candidateMoves.length === 0) return null;
          const unitIds = Array.from(new Set(candidateMoves.map(m => m.unitId)));
          const unused = unitIds.filter(uid => !movedCavalryThisTurn.has(uid));
          const used = unitIds.filter(uid => movedCavalryThisTurn.has(uid));
          const ordered = [...orderUnitIdsByBehind(unused), ...orderUnitIdsByBehind(used)];
          for (const uid of ordered) {
            const forUnit = candidateMoves.filter(m => m.unitId === uid);
            if (forUnit.length === 0) continue;
            const chosen = pickMostForward(forUnit, gameState, playerId) as Extract<Action, { type: 'MOVE' }>;
            movedCavalryThisTurn.add(uid);
            return chosen;
          }
          return null;
        };

        // Prefer forward moves; choose the most-behind cavalry to move first
        const chosenForward = pickForMostBehind(forwardMoves);
        if (chosenForward) return chosenForward;

        // No forward moves; pick any move, still preferring the most-behind cavalry
        const chosenAny = pickForMostBehind(moves);
        if (chosenAny) return chosenAny;

        priority = 'DEPLOY';
        return null;
      };

      let action: Action | null = priority === 'DEPLOY' ? tryDeploy() : tryMove();
      if (!action) {
        action = priority === 'DEPLOY' ? tryDeploy() : tryMove();
      }
      return (
        action ??
        availableActions.find(a => a.type === 'END_TURN') ??
        availableActions[0]
      );
    }
  };
}
