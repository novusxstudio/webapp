import type { UnitStats } from './GameState';

// Allowed unit types: Swordsman, Shieldman, Axeman, Cavalry, Archer, Spearman
export const UNIT_DATA: Record<string, UnitStats> = {
  axeman: {
    type: 'Axeman',
    moveRange: 1,
    attackRange: 1,
  },
  swordsman: {
    type: 'Swordsman',
    moveRange: 1,
    attackRange: 1,
  },
  archer: {
    type: 'Archer',
    moveRange: 1,
    attackRange: 2,
  },
  shieldman: {
    type: 'Shieldman',
    moveRange: 1,
    attackRange: 1,
  },
  cavalry: {
    type: 'Cavalry',
    moveRange: 2,
    attackRange: 1,
  },
  spearman: {
    type: 'Spearman',
    moveRange: 1,
    attackRange: 2,
  },
};
