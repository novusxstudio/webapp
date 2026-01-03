import type { Bot } from './types';
import { createEndTurnBot } from './EndTurnBot';
import { createCavalryRushBot } from './CavalryRushBot';
import { createCounterBot } from './CounterBot';
import { createCounterV2Bot } from './CounterV2Bot';
import { createCounterV3Bot } from './CounterV3Bot';
import { createLookaheadBot } from './LookaheadBot';
import { createLookaheadBotV2 } from './LookaheadBotV2';
import { createLookaheadBotV3 } from './LookaheadBotV3';
import { createLookaheadBotV4 } from './LookaheadBotV4';
import { createLookaheadBotV5 } from './LookaheadBotV5';
import { createLookaheadBotV6 } from './LookaheadBotV6';
import { createLookaheadBotV7 } from './LookaheadBotV7';
import { createLookaheadBotV8 } from './LookaheadBotV8';
import { createLookaheadBotVPro } from './LookaheadBotVPro';
import { createLookaheadBotVProMAX } from './LookaheadBotVProMAX';
import { createCursorBot } from './CursorBot';

export const BOT_REGISTRY: Record<string, () => Bot> = {
  end_turn_bot: createEndTurnBot,
  cavalry_rush_bot: createCavalryRushBot,
  counter_bot: createCounterBot,
  counter_v2_bot: createCounterV2Bot,
  counter_v3_bot: createCounterV3Bot,
  lookahead_bot: createLookaheadBot,
  lookahead_bot_v2: createLookaheadBotV2,
  lookahead_bot_v3: createLookaheadBotV3,
  lookahead_bot_v4: createLookaheadBotV4,
  lookahead_bot_v5: createLookaheadBotV5,
  lookahead_bot_v6: createLookaheadBotV6,
  lookahead_bot_v7: createLookaheadBotV7,
  lookahead_bot_v8: createLookaheadBotV8,
  lookahead_bot_vpro: createLookaheadBotVPro,
  lookahead_bot_vpromax: createLookaheadBotVProMAX,
  cursor_bot: createCursorBot,
};

export type { Bot } from './types';
export { createEndTurnBot, createCavalryRushBot, createCounterBot, createCounterV2Bot, createCounterV3Bot, createLookaheadBot, createLookaheadBotV2, createLookaheadBotV3, createLookaheadBotV4, createLookaheadBotV5, createLookaheadBotV6, createLookaheadBotV7, createLookaheadBotV8, createLookaheadBotVPro, createLookaheadBotVProMAX, createCursorBot };
