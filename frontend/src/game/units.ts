export interface UnitStats {
  atk: number;
  def: number;
  hp: number;
  maxHp: number;
  moveRange: number;
  attackRange: number;
  cost: number;
}

export const UNIT_DATA: Record<string, UnitStats> = {
  spearman: {
    atk: 6,
    def: 2,
    hp: 2,
    maxHp: 2,
    moveRange: 1,
    attackRange: 1,
    cost: 1,
  },
  swordsman: {
    atk: 5,
    def: 3,
    hp: 2,
    maxHp: 2,
    moveRange: 1,
    attackRange: 1,
    cost: 1,
  },
  archer: {
    atk: 5,
    def: 1,
    hp: 2,
    maxHp: 2,
    moveRange: 1,
    attackRange: 2,
    cost: 1,
  },
  shieldman: {
    atk: 3,
    def: 4,
    hp: 2,
    maxHp: 2,
    moveRange: 1,
    attackRange: 1,
    cost: 1,
  },
  heavySwordsman: {
    atk: 5,
    def: 4,
    hp: 3,
    maxHp: 3,
    moveRange: 1,
    attackRange: 1,
    cost: 2,
  },
  cannoneer: {
    atk: 7,
    def: 1,
    hp: 3,
    maxHp: 3,
    moveRange: 1,
    attackRange: 2,
    cost: 2,
  },
  horseman: {
    atk: 5,
    def: 2,
    hp: 3,
    maxHp: 3,
    moveRange: 2,
    attackRange: 1,
    cost: 2,
  },
  armoredHorseman: {
    atk: 5,
    def: 4,
    hp: 3,
    maxHp: 3,
    moveRange: 2,
    attackRange: 1,
    cost: 3,
  },
};
