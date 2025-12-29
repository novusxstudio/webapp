import { EndTurnBot } from './EndTurnBot';
import type { Bot } from './types';

export const BOT_REGISTRY: Record<string, Bot> = {
  end_turn_bot: EndTurnBot,
};

export type { Bot } from './types';
export { EndTurnBot };
