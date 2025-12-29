import type { Bot } from './types';
import { createEndTurnBot } from './EndTurnBot';
import { createCavalryRushBot } from './CavalryRushBot';
import { createCounterBot } from './CounterBot';

export const BOT_REGISTRY: Record<string, () => Bot> = {
  end_turn_bot: createEndTurnBot,
  cavalry_rush_bot: createCavalryRushBot,
  counter_bot: createCounterBot,
};

export type { Bot } from './types';
export { createEndTurnBot, createCavalryRushBot, createCounterBot };
