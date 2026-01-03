// Backend types that wrap existing frontend game logic without changing it

import type { GameState, Position, Unit } from './logic/GameState';

export type PlayerId = 0 | 1;

// PlayerAction describes the actions clients may request.
// These map directly to existing logic functions in frontend/src/game/rules.ts and App handlers.
export type PlayerAction =
  | { kind: 'MOVE'; unitId: string; target: Position }
  | { kind: 'ATTACK'; attackerId: string; targetPos: Position }
  | { kind: 'ROTATE'; unitId: string; targetPos: Position }
  | { kind: 'DEPLOY'; unitType: 'Swordsman' | 'Shieldman' | 'Axeman' | 'Cavalry' | 'Archer' | 'Spearman'; targetPos: Position }
  | { kind: 'END_TURN' };

export interface CreateGameResponse {
  gameId: string;
  playerId: PlayerId;
  state: GameState;
  reconnectToken: string;
}

export interface JoinGameRequest {
  gameId: string;
}

export interface JoinGameResponse {
  gameId: string;
  playerId: PlayerId;
  state: GameState;
  reconnectToken: string;
}

export interface PlayerActionRequest {
  type: 'PLAYER_ACTION';
  gameId: string;
  action: PlayerAction;
}

export interface ReconnectRequest {
  type: 'RECONNECT';
  gameId: string;
  playerId: PlayerId;
  reconnectToken: string;
}

export interface GameInstanceDescriptor {
  id: string;
  players: Map<PlayerId, string>; // socket.id
  state: GameState;
}

export { GameState, Position, Unit };
