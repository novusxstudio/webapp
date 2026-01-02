import type { Bot } from './types';
import { createEndTurnBot } from './EndTurnBot';
import { createCavalryRushBot } from './CavalryRushBot';
import { createCounterBot } from './CounterBot';
import { 
  createRLAgent100_P0, createRLAgent100_P1,
  createRLAgent1000_P0, createRLAgent1000_P1,
  createRLAgent10000_P0, createRLAgent10000_P1,
  createRLAgent100000_P0, createRLAgent100000_P1,
  createRLAgentInt2128_P0, createRLAgentInt2128_P1,
  createRLAgentInt14457_P0, createRLAgentInt14457_P1,
} from './RLAgentBot';

export const BOT_REGISTRY: Record<string, () => Bot> = {
  end_turn_bot: createEndTurnBot,
  cavalry_rush_bot: createCavalryRushBot,
  counter_bot: createCounterBot,
  // RL Agents at different training iterations (P0 and P1 variants)
  rl_agent_iter_100_p0: createRLAgent100_P0,
  rl_agent_iter_100_p1: createRLAgent100_P1,
  rl_agent_iter_1000_p0: createRLAgent1000_P0,
  rl_agent_iter_1000_p1: createRLAgent1000_P1,
  rl_agent_iter_10000_p0: createRLAgent10000_P0,
  rl_agent_iter_10000_p1: createRLAgent10000_P1,
  rl_agent_iter_100000_p0: createRLAgent100000_P0,
  rl_agent_iter_100000_p1: createRLAgent100000_P1,
  // Interrupted training checkpoints
  rl_agent_int_2128_p0: createRLAgentInt2128_P0,
  rl_agent_int_2128_p1: createRLAgentInt2128_P1,
  rl_agent_int_14457_p0: createRLAgentInt14457_P0,
  rl_agent_int_14457_p1: createRLAgentInt14457_P1,
};

export type { Bot } from './types';
export { createEndTurnBot, createCavalryRushBot, createCounterBot };
export { 
  createRLAgent100_P0, createRLAgent100_P1,
  createRLAgent1000_P0, createRLAgent1000_P1,
  createRLAgent10000_P0, createRLAgent10000_P1,
  createRLAgent100000_P0, createRLAgent100000_P1,
  createRLAgentInt2128_P0, createRLAgentInt2128_P1,
  createRLAgentInt14457_P0, createRLAgentInt14457_P1,
};
