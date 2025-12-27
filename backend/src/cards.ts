// Card definitions strictly following the ruleset
import { Card } from './types';

let cardIdCounter = 0;

function createCard(name: string, cost: number, type: 'unit' | 'spell', unitStats?: any, spellEffect?: any): Card {
  return {
    id: `card-${cardIdCounter++}`,
    name,
    cost,
    type,
    unitStats,
    spellEffect
  };
}

// 1-Coin Units
export const SPEARMAN: Omit<Card, 'id'> = {
  name: 'Spearman',
  cost: 1,
  type: 'unit',
  unitStats: { atk: 6, def: 2, hp: 2, maxHp: 2, move: 1, range: 1 }
};

export const SWORDSMAN: Omit<Card, 'id'> = {
  name: 'Swordsman',
  cost: 1,
  type: 'unit',
  unitStats: { atk: 5, def: 3, hp: 2, maxHp: 2, move: 1, range: 1 }
};

export const ARCHER: Omit<Card, 'id'> = {
  name: 'Archer',
  cost: 1,
  type: 'unit',
  unitStats: { atk: 5, def: 1, hp: 2, maxHp: 2, move: 1, range: 2 }
};

export const SHIELDMAN: Omit<Card, 'id'> = {
  name: 'Shieldman',
  cost: 1,
  type: 'unit',
  unitStats: { atk: 3, def: 4, hp: 2, maxHp: 2, move: 1, range: 1 }
};

// 2-Coin Units
export const HEAVY_SWORDSMAN: Omit<Card, 'id'> = {
  name: 'Heavy Swordsman',
  cost: 2,
  type: 'unit',
  unitStats: { atk: 5, def: 4, hp: 3, maxHp: 3, move: 1, range: 1 }
};

export const CANNONEER: Omit<Card, 'id'> = {
  name: 'Cannoneer',
  cost: 2,
  type: 'unit',
  unitStats: { atk: 7, def: 1, hp: 3, maxHp: 3, move: 1, range: 2 }
};

export const HORSEMAN: Omit<Card, 'id'> = {
  name: 'Horseman',
  cost: 2,
  type: 'unit',
  unitStats: { atk: 5, def: 2, hp: 3, maxHp: 3, move: 2, range: 1 }
};

// 3-Coin Units
export const ARMORED_HORSEMAN: Omit<Card, 'id'> = {
  name: 'Armored Horseman',
  cost: 3,
  type: 'unit',
  unitStats: { atk: 5, def: 4, hp: 3, maxHp: 3, move: 2, range: 1 }
};

// Spells
export const LIGHTNING_STRIKE: Omit<Card, 'id'> = {
  name: 'Lightning Strike',
  cost: 2,
  type: 'spell',
  spellEffect: 'lightning_strike'
};

export const HEALING_CIRCLE: Omit<Card, 'id'> = {
  name: 'Healing Circle',
  cost: 2,
  type: 'spell',
  spellEffect: 'healing_circle'
};

export const RECRUITMENT: Omit<Card, 'id'> = {
  name: 'Recruitment',
  cost: 3,
  type: 'spell',
  spellEffect: 'recruitment'
};

export function createCardWithId(template: Omit<Card, 'id'>): Card {
  return {
    ...template,
    id: `card-${cardIdCounter++}`
  };
}

// Create starter deck for a player
export function createStarterDeck(): Card[] {
  return [
    createCardWithId(SWORDSMAN),
    createCardWithId(SHIELDMAN),
    createCardWithId(ARCHER),
    createCardWithId(SPEARMAN),
    createCardWithId(LIGHTNING_STRIKE)
  ];
}
