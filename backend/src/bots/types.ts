import type { GameState } from '../logic/GameState';
import type { Action } from '../engine/actions';

export interface BotContext {
  gameState: Readonly<GameState>;
  playerId: 0 | 1;
  availableActions: Readonly<Action[]>;
}

export interface Bot {
  id: string;
  name: string;
  trainedAsPlayer?: 0 | 1;  // For RL agents: which player role was this agent trained as
  decideAction(ctx: BotContext): Action;
}
