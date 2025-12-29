import type { Bot } from './types';

export const EndTurnBot: Bot = {
  id: 'end_turn_bot',
  name: 'EndTurn',
  decideAction({ availableActions }) {
    const end = availableActions.find(a => a.type === 'END_TURN');
    return end ?? availableActions[0];
  },
};
