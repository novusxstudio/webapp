import type { Position, GameState } from './GameState';
import { CARDS } from './cards';
import { UNIT_DATA } from './units';

export const CONTROL_POINTS: Position[] = [
  { row: 3, col: 1 },
  { row: 3, col: 3 },
  { row: 3, col: 5 },
];

export function getDistance(a: Position, b: Position): number {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  
  if (dx === 1 && dy === 1) {
    return 2;
  }
  
  return dx + dy;
}

export function calculateDamage(atk: number, def: number): number {
  return Math.max(atk - def, 0);
}

export function controlsPosition(state: GameState, playerId: number, pos: Position): boolean {
  const tile = state.grid[pos.row - 1][pos.col - 1];
  return tile.unit !== null && tile.unit.ownerId === playerId;
}

export function controlsAllPoints(state: GameState, playerId: number): boolean {
  return CONTROL_POINTS.every(pos => controlsPosition(state, playerId, pos));
}

export function checkWin(state: GameState, playerId: number): boolean {
  return controlsAllPoints(state, playerId);
}
export function canDeploy(state: GameState, cardId: string, targetPos: Position): boolean {
  // Card must exist
  const card = CARDS[cardId];
  if (!card) return false;
  
  // Card must be a unit card
  if (card.type !== 'unit') return false;
  
  // Card must be in current player's hand
  const currentPlayer = state.players[state.currentPlayer];
  if (!currentPlayer.hand.includes(cardId)) return false;
  
  // Player must have enough coins
  if (currentPlayer.coins < card.cost) return false;
  
  // Target tile must be empty
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit !== null) return false;
  
  // Target row must be valid for current player
  const validRow = state.currentPlayer === 0 ? 1 : 5;
  if (targetPos.row !== validRow) return false;
  
  return true;
}

export function applyDeploy(state: GameState, cardId: string, targetPos: Position): GameState {
  // Validate deployment
  if (!canDeploy(state, cardId, targetPos)) {
    throw new Error(`Invalid deployment of ${cardId} to (${targetPos.row}, ${targetPos.col})`);
  }
  
  // Get unit stats
  const unitStats = UNIT_DATA[cardId];
  if (!unitStats) {
    throw new Error(`Unit data not found for ${cardId}`);
  }
  
  // Create unique unit id
  const unitId = `${state.currentPlayer}-${cardId}-${Date.now()}`;
  
  // Create new unit
  const newUnit = {
    id: unitId,
    ownerId: state.currentPlayer,
    stats: { ...unitStats },
    position: { row: targetPos.row, col: targetPos.col },
  };
  
  // Get card cost
  const card = CARDS[cardId];
  
  // Remove card from hand, add to discard, and deduct cost (only one occurrence)
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      const cardIndex = player.hand.indexOf(cardId);
      const newHand = [...player.hand.slice(0, cardIndex), ...player.hand.slice(cardIndex + 1)];
      return {
        ...player,
        hand: newHand,
        discard: [...player.discard, cardId],
        coins: player.coins - card.cost,
      };
    }
    return player;
  });
  
  // Place unit on board
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === targetPos.row - 1) {
      return row.map((tile, colIndex) => {
        if (colIndex === targetPos.col - 1) {
          return {
            ...tile,
            unit: newUnit,
          };
        }
        return tile;
      });
    }
    return row;
  });
  
  return {
    ...state,
    grid: newGrid,
    players: newPlayers,
  };
}

export function canCastSpell(state: GameState, cardId: string, targetPos: Position): boolean {
  // Card must exist
  const card = CARDS[cardId];
  if (!card) return false;
  
  // Card must be a spell card
  if (card.type !== 'spell') return false;
  
  // Card must be in current player's hand
  const currentPlayer = state.players[state.currentPlayer];
  if (!currentPlayer.hand.includes(cardId)) return false;
  
  // Player must have enough coins
  if (currentPlayer.coins < card.cost) return false;
  
  // Target tile must contain a unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) return false;
  
  const targetUnit = targetTile.unit;
  
  // Lightning Strike: target must be enemy unit
  if (cardId === 'lightningStrike') {
    if (targetUnit.ownerId === state.currentPlayer) return false;
  }
  
  // Healing Circle: target must be friendly unit
  if (cardId === 'healingCircle') {
    if (targetUnit.ownerId !== state.currentPlayer) return false;
  }
  
  return true;
}

export function applySpell(state: GameState, cardId: string, targetPos: Position): GameState {
  // Validate spell casting
  if (!canCastSpell(state, cardId, targetPos)) {
    throw new Error(`Invalid spell cast of ${cardId} at (${targetPos.row}, ${targetPos.col})`);
  }
  
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  const targetUnit = targetTile.unit!;
  
  // Apply spell effect
  let newGrid = state.grid;
  
  if (cardId === 'lightningStrike') {
    // Deal 3 damage ignoring DEF
    const newHp = targetUnit.stats.hp - 3;
    
    newGrid = state.grid.map((row, rowIndex) => {
      if (rowIndex === targetPos.row - 1) {
        return row.map((tile, colIndex) => {
          if (colIndex === targetPos.col - 1) {
            if (newHp <= 0) {
              // Remove unit
              return { ...tile, unit: null };
            } else {
              // Update unit HP
              return {
                ...tile,
                unit: {
                  ...targetUnit,
                  stats: {
                    ...targetUnit.stats,
                    hp: newHp
                  }
                }
              };
            }
          }
          return tile;
        });
      }
      return row;
    });
  } else if (cardId === 'healingCircle') {
    // Heal unit to max HP
    newGrid = state.grid.map((row, rowIndex) => {
      if (rowIndex === targetPos.row - 1) {
        return row.map((tile, colIndex) => {
          if (colIndex === targetPos.col - 1) {
            return {
              ...tile,
              unit: {
                ...targetUnit,
                stats: {
                  ...targetUnit.stats,
                  hp: targetUnit.stats.maxHp
                }
              }
            };
          }
          return tile;
        });
      }
      return row;
    });
  }
  
  // Get card cost
  const card = CARDS[cardId];
  
  // Remove spell card from hand, add to discard, and deduct cost (only one occurrence)
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      const cardIndex = player.hand.indexOf(cardId);
      const newHand = [...player.hand.slice(0, cardIndex), ...player.hand.slice(cardIndex + 1)];
      return {
        ...player,
        hand: newHand,
        discard: [...player.discard, cardId],
        coins: player.coins - card.cost,
      };
    }
    return player;
  });
  
  return {
    ...state,
    grid: newGrid,
    players: newPlayers,
  };
}

export function canMove(state: GameState, unitId: string, target: Position): boolean {
  // Find the unit by unitId
  let foundUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        foundUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (foundUnit) break;
  }
  
  // Unit must exist
  if (!foundUnit || !sourcePos) {
    return false;
  }
  
  // Target tile must be empty
  const targetTile = state.grid[target.row - 1][target.col - 1];
  if (targetTile.unit !== null) {
    return false;
  }
  
  // Validate movement distance
  const distance = getDistance(sourcePos, target);
  if (distance > foundUnit.stats.moveRange) {
    return false;
  }
  
  // Check for blocked orthogonal paths
  const dx = Math.abs(target.col - sourcePos.col);
  const dy = Math.abs(target.row - sourcePos.row);
  const isDiagonal = dx === 1 && dy === 1;
  
  if (!isDiagonal && distance > 1) {
    // Orthogonal move with distance > 1: check the single intermediate tile
    const isHorizontal = dy === 0;
    const isVertical = dx === 0;
    
    if (isHorizontal) {
      // Moving horizontally: check middle tile
      const midCol = (sourcePos.col + target.col) / 2;
      const intermediateTile = state.grid[sourcePos.row - 1][midCol - 1];
      if (intermediateTile.unit !== null) {
        return false;
      }
    } else if (isVertical) {
      // Moving vertically: check middle tile
      const midRow = (sourcePos.row + target.row) / 2;
      const intermediateTile = state.grid[midRow - 1][sourcePos.col - 1];
      if (intermediateTile.unit !== null) {
        return false;
      }
    }
  }
  // Diagonal moves are never blocked
  
  return true;
}

export function canRotate(state: GameState, unitId: string, targetPos: Position): boolean {
  // Find the source unit by unitId
  let sourceUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        sourceUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (sourceUnit) break;
  }
  
  // Source unit must exist
  if (!sourceUnit || !sourcePos) {
    return false;
  }
  
  // Target tile must contain a unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) {
    return false;
  }
  
  const targetUnit = targetTile.unit;
  
  // Both units must belong to currentPlayer
  if (sourceUnit.ownerId !== state.currentPlayer) {
    return false;
  }
  if (targetUnit.ownerId !== state.currentPlayer) {
    return false;
  }
  
  // Units must be orthogonally adjacent (distance === 1)
  const distance = getDistance(sourcePos, targetPos);
  if (distance !== 1) {
    return false;
  }
  
  return true;
}

export function applyMove(state: GameState, unitId: string, target: Position): GameState {
  // Validate move
  if (!canMove(state, unitId, target)) {
    throw new Error(`Invalid move for unit ${unitId} to (${target.row}, ${target.col})`);
  }
  
  // Find the unit by unitId (we know it exists from canMove)
  let foundUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        foundUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (foundUnit) break;
  }
  
  // Clone only affected rows
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === sourcePos!.row - 1 || rowIndex === target.row - 1) {
      return row.map((tile, colIndex) => {
        if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) {
          // Clear source tile
          return { ...tile, unit: null };
        } else if (rowIndex === target.row - 1 && colIndex === target.col - 1) {
          // Set target tile with moved unit
          return {
            ...tile,
            unit: {
              ...foundUnit!,
              position: { row: target.row, col: target.col },
              stats: { ...foundUnit!.stats }
            }
          };
        }
        return tile;
      });
    }
    return row;
  });
  
  return {
    ...state,
    grid: newGrid
  };
}

export function applyRotate(state: GameState, unitId: string, targetPos: Position): GameState {
  // Validate rotate
  if (!canRotate(state, unitId, targetPos)) {
    throw new Error(`Invalid rotate for unit ${unitId} with (${targetPos.row}, ${targetPos.col})`);
  }
  
  // Find the source unit by unitId
  let sourceUnit = null;
  let sourcePos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === unitId) {
        sourceUnit = unit;
        sourcePos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (sourceUnit) break;
  }
  
  // Get target unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  const targetUnit = targetTile.unit!;
  
  // Swap positions
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === sourcePos!.row - 1 || rowIndex === targetPos.row - 1) {
      return row.map((tile, colIndex) => {
        if (rowIndex === sourcePos!.row - 1 && colIndex === sourcePos!.col - 1) {
          // Place target unit at source position
          return {
            ...tile,
            unit: {
              ...targetUnit,
              position: { row: sourcePos!.row, col: sourcePos!.col },
            }
          };
        } else if (rowIndex === targetPos.row - 1 && colIndex === targetPos.col - 1) {
          // Place source unit at target position
          return {
            ...tile,
            unit: {
              ...sourceUnit!,
              position: { row: targetPos.row, col: targetPos.col },
            }
          };
        }
        return tile;
      });
    }
    return row;
  });
  
  return {
    ...state,
    grid: newGrid
  };
}

export function applyAttack(state: GameState, attackerId: string, targetPos: Position): GameState {
  // Find the attacker unit by attackerId
  let attacker = null;
  let attackerPos = null;
  
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.grid[row][col].unit;
      if (unit && unit.id === attackerId) {
        attacker = unit;
        attackerPos = { row: row + 1, col: col + 1 };
        break;
      }
    }
    if (attacker) break;
  }
  
  if (!attacker || !attackerPos) {
    throw new Error(`Attacker with id ${attackerId} not found`);
  }
  
  // Validate target tile contains a unit
  const targetTile = state.grid[targetPos.row - 1][targetPos.col - 1];
  if (targetTile.unit === null) {
    throw new Error(`No unit at target position (${targetPos.row}, ${targetPos.col})`);
  }
  
  const defender = targetTile.unit;
  
  // Validate target is an enemy unit
  if (defender.ownerId === attacker.ownerId) {
    throw new Error(`Cannot attack friendly unit`);
  }
  
  // Validate attack range
  const distance = getDistance(attackerPos, targetPos);
  if (distance > attacker.stats.attackRange) {
    throw new Error(`Attack distance ${distance} exceeds unit's attackRange ${attacker.stats.attackRange}`);
  }
  
  // Calculate damage
  const damage = calculateDamage(attacker.stats.atk, defender.stats.def);
  const newHp = defender.stats.hp - damage;
  
  // Clone only affected row
  const newGrid = state.grid.map((row, rowIndex) => {
    if (rowIndex === targetPos.row - 1) {
      return row.map((tile, colIndex) => {
        if (colIndex === targetPos.col - 1) {
          if (newHp <= 0) {
            // Remove unit
            return { ...tile, unit: null };
          } else {
            // Update defender HP
            return {
              ...tile,
              unit: {
                ...defender,
                stats: {
                  ...defender.stats,
                  hp: newHp
                }
              }
            };
          }
        }
        return tile;
      });
    }
    return row;
  });
  
  return {
    ...state,
    grid: newGrid
  };
}

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createDeck(): string[] {
  const deck: string[] = [];
  
  // Add 3 copies of each card
  for (const cardId of Object.keys(CARDS)) {
    deck.push(cardId, cardId, cardId);
  }
  
  // Shuffle the deck
  return shuffleArray(deck);
}

export function drawCard(state: GameState): GameState {
  const currentPlayer = state.players[state.currentPlayer];
  
  // If deck is empty, do nothing
  if (currentPlayer.deck.length === 0) {
    return state;
  }
  
  // If player doesn't have enough coins, do nothing
  if (currentPlayer.coins < 1) {
    return state;
  }
  
  // Draw top card from deck
  const [drawnCard, ...remainingDeck] = currentPlayer.deck;
  
  // Add card to hand and deduct 1 coin
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      return {
        ...player,
        hand: [...player.hand, drawnCard],
        deck: remainingDeck,
        coins: player.coins - 1,
      };
    }
    return player;
  });
  
  return {
    ...state,
    players: newPlayers,
  };
}

export function getControlBonuses(state: GameState, playerId: number): { bonusCoins: number; bonusActions: number } {
  let bonusCoins = 0;
  let bonusActions = 0;
  
  // (3,1) → +2 coins
  if (controlsPosition(state, playerId, { row: 3, col: 1 })) {
    bonusCoins += 2;
  }
  
  // (3,5) → +1 coin
  if (controlsPosition(state, playerId, { row: 3, col: 5 })) {
    bonusCoins += 1;
  }
  
  // (3,3) → +1 extra action
  if (controlsPosition(state, playerId, { row: 3, col: 3 })) {
    bonusActions += 1;
  }
  
  return { bonusCoins, bonusActions };
}

export function endTurn(state: GameState): GameState {
  const newCurrentPlayer = state.currentPlayer === 0 ? 1 : 0;
  
  // Get control bonuses for new current player
  const bonuses = getControlBonuses(state, newCurrentPlayer);
  
  const newPlayers = state.players.map((player, index) => {
    if (index === newCurrentPlayer) {
      return {
        ...player,
        actionsRemaining: 1 + bonuses.bonusActions,
        coins: player.coins + 1 + bonuses.bonusCoins
      };
    }
    return player;
  });

  return {
    ...state,
    currentPlayer: newCurrentPlayer,
    turnNumber: state.turnNumber + 1,
    players: newPlayers
  };
}

export function sellCard(state: GameState, cardId: string): GameState {
  const currentPlayer = state.players[state.currentPlayer];
  
  // Card must be in current player's hand
  if (!currentPlayer.hand.includes(cardId)) {
    throw new Error(`Card ${cardId} not in current player's hand`);
  }
  
  // Remove card from hand, add to discard, and add 1 coin (only one occurrence)
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      const cardIndex = player.hand.indexOf(cardId);
      const newHand = [...player.hand.slice(0, cardIndex), ...player.hand.slice(cardIndex + 1)];
      return {
        ...player,
        hand: newHand,
        discard: [...player.discard, cardId],
        coins: player.coins + 1
      };
    }
    return player;
  });
  
  return {
    ...state,
    players: newPlayers
  };
}

export function canRecruit(state: GameState, cardId: string): boolean {
  // Card must be Recruitment
  if (cardId !== 'recruitment') return false;
  
  // Card must be in current player's hand
  const currentPlayer = state.players[state.currentPlayer];
  if (!currentPlayer.hand.includes(cardId)) return false;
  
  // Player must have enough coins
  if (currentPlayer.coins < 3) return false;
  
  // Deck must not be empty
  if (currentPlayer.deck.length === 0) return false;
  
  return true;
}

export function applyRecruit(state: GameState, cardId: string, chosenCardId: string): GameState {
  // Validate recruitment
  if (!canRecruit(state, cardId)) {
    throw new Error(`Invalid recruitment with card ${cardId}`);
  }
  
  const currentPlayer = state.players[state.currentPlayer];
  
  // Chosen card must be in deck
  if (!currentPlayer.deck.includes(chosenCardId)) {
    throw new Error(`Card ${chosenCardId} not found in deck`);
  }
  
  // Remove Recruitment card from hand, add to discard, remove chosen card from deck, add chosen card to hand, deduct 3 coins
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      const recruitmentIndex = player.hand.indexOf(cardId);
      const newHand = [...player.hand.slice(0, recruitmentIndex), ...player.hand.slice(recruitmentIndex + 1), chosenCardId];
      const deckIndex = player.deck.indexOf(chosenCardId);
      const newDeck = [...player.deck.slice(0, deckIndex), ...player.deck.slice(deckIndex + 1)];
      return {
        ...player,
        hand: newHand,
        deck: newDeck,
        discard: [...player.discard, cardId],
        coins: player.coins - 3
      };
    }
    return player;
  });
  
  return {
    ...state,
    players: newPlayers
  };
}

export function canRetrieveFromDiscard(state: GameState, cardId: string): boolean {
  const currentPlayer = state.players[state.currentPlayer];
  
  // Card must exist in current player's discard pile
  if (!currentPlayer.discard.includes(cardId)) {
    return false;
  }
  
  // Card must exist in CARDS
  const card = CARDS[cardId];
  if (!card) {
    return false;
  }
  
  // Player must have enough coins
  if (currentPlayer.coins < card.cost) {
    return false;
  }
  
  return true;
}

export function applyRetrieveFromDiscard(state: GameState, cardId: string): GameState {
  // Validate retrieval
  if (!canRetrieveFromDiscard(state, cardId)) {
    throw new Error(`Cannot retrieve card ${cardId} from discard`);
  }
  
  const card = CARDS[cardId];
  
  // Remove card from discard, add to hand, deduct cost (only one occurrence)
  const newPlayers = state.players.map((player, index) => {
    if (index === state.currentPlayer) {
      const cardIndex = player.discard.indexOf(cardId);
      const newDiscard = [...player.discard.slice(0, cardIndex), ...player.discard.slice(cardIndex + 1)];
      return {
        ...player,
        discard: newDiscard,
        hand: [...player.hand, cardId],
        coins: player.coins - card.cost,
      };
    }
    return player;
  });
  
  return {
    ...state,
    players: newPlayers
  };
}
