export type CardType = "unit" | "spell";

export interface Card {
  id: string;
  name: string;
  type: CardType;
  cost: number;
  description: string;
}

export const CARDS: Record<string, Card> = {
  spearman: {
    id: "spearman",
    name: "Spearman",
    type: "unit",
    cost: 1,
    description: "ATK 6, DEF 2, HP 2, MOVE 1, RANGE 1",
  },
  swordsman: {
    id: "swordsman",
    name: "Swordsman",
    type: "unit",
    cost: 1,
    description: "ATK 5, DEF 3, HP 2, MOVE 1, RANGE 1",
  },
  archer: {
    id: "archer",
    name: "Archer",
    type: "unit",
    cost: 1,
    description: "ATK 5, DEF 1, HP 2, MOVE 1, RANGE 2",
  },
  shieldman: {
    id: "shieldman",
    name: "Shieldman",
    type: "unit",
    cost: 1,
    description: "ATK 3, DEF 4, HP 2, MOVE 1, RANGE 1",
  },
  heavySwordsman: {
    id: "heavySwordsman",
    name: "Heavy Swordsman",
    type: "unit",
    cost: 2,
    description: "ATK 5, DEF 4, HP 3, MOVE 1, RANGE 1",
  },
  cannoneer: {
    id: "cannoneer",
    name: "Cannoneer",
    type: "unit",
    cost: 2,
    description: "ATK 7, DEF 1, HP 3, MOVE 1, RANGE 2",
  },
  horseman: {
    id: "horseman",
    name: "Horseman",
    type: "unit",
    cost: 2,
    description: "ATK 5, DEF 2, HP 3, MOVE 2, RANGE 1",
  },
  armoredHorseman: {
    id: "armoredHorseman",
    name: "Armored Horseman",
    type: "unit",
    cost: 3,
    description: "ATK 5, DEF 4, HP 3, MOVE 2, RANGE 1",
  },
  lightningStrike: {
    id: "lightningStrike",
    name: "Lightning Strike",
    type: "spell",
    cost: 2,
    description: "Deal 5 damage ignoring DEF",
  },
  healingCircle: {
    id: "healingCircle",
    name: "Healing Circle",
    type: "spell",
    cost: 2,
    description: "Heal friendly units to max HP",
  },
  recruitment: {
    id: "recruitment",
    name: "Recruitment",
    type: "spell",
    cost: 3,
    description: "Search deck for any card and add it to hand",
  },
};
