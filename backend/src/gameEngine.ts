// Authoritative game engine - all rules enforced server-side
import { 
  GameState, 
  GameAction, 
  ActionResult, 
  Unit, 
  Position, 
  PlayerId,
  PlayerState,
  ControlPoint,
  Card
} from './types';
import { createStarterDeck, createCardWithId } from './cards';
import * as CardTemplates from './cards';

let unitIdCounter = 0;

// Initialize game state
export function createInitialGameState(): GameState {
  const board: (Unit | null)[][] = Array(5).fill(null).map(() => Array(5).fill(null));
  
  return {
    board,
    players: {
      A: {
        id: 'A',
        coins: 1,
        actions: 1,
        hand: createStarterDeck(),
        deck: [],
        discard: []
      },
      B: {
        id: 'B',
        coins: 1,
        actions: 1,
        hand: createStarterDeck(),
        deck: [],
        discard: []
      }
    },
    controlPoints: [
      { position: { row: 3, col: 1 }, type: 'left', controlledBy: null },
      { position: { row: 3, col: 3 }, type: 'center', controlledBy: null },
      { position: { row: 3, col: 5 }, type: 'right', controlledBy: null }
    ],
    currentPlayer: 'A',
    turnPhase: 'action',
    winner: null,
    turnNumber: 1
  };
}

// Distance calculation: orthogonal = 1, diagonal = 2
function calculateDistance(from: Position, to: Position): number {
  const rowDiff = Math.abs(from.row - to.row);
  const colDiff = Math.abs(from.col - to.col);
  
  if (rowDiff === 0) return colDiff;
  if (colDiff === 0) return rowDiff;
  
  // Diagonal
  const minDiff = Math.min(rowDiff, colDiff);
  const maxDiff = Math.max(rowDiff, colDiff);
  return minDiff * 2 + (maxDiff - minDiff);
}

// Check if positions are adjacent (distance 1)
function areAdjacent(pos1: Position, pos2: Position): boolean {
  return calculateDistance(pos1, pos2) === 1;
}

// Get unit from board
function getUnit(state: GameState, unitId: string): Unit | null {
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const unit = state.board[row][col];
      if (unit && unit.id === unitId) {
        return unit;
      }
    }
  }
  return null;
}

// Get unit at position
function getUnitAt(state: GameState, pos: Position): Unit | null {
  if (pos.row < 1 || pos.row > 5 || pos.col < 1 || pos.col > 5) {
    return null;
  }
  return state.board[pos.row - 1][pos.col - 1];
}

// Set unit at position
function setUnitAt(state: GameState, pos: Position, unit: Unit | null): void {
  if (pos.row >= 1 && pos.row <= 5 && pos.col >= 1 && pos.col <= 5) {
    state.board[pos.row - 1][pos.col - 1] = unit;
  }
}

// Deep clone game state
function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state));
}

// Update control points
function updateControlPoints(state: GameState): void {
  for (const cp of state.controlPoints) {
    const unit = getUnitAt(state, cp.position);
    cp.controlledBy = unit ? unit.owner : null;
  }
}

// Check win condition
function checkWinCondition(state: GameState): PlayerId | null {
  const controlledByCurrentPlayer = state.controlPoints.every(
    cp => cp.controlledBy === state.currentPlayer
  );
  
  return controlledByCurrentPlayer ? state.currentPlayer : null;
}

// Start of turn effects
function applyStartOfTurnEffects(state: GameState): void {
  const player = state.players[state.currentPlayer];
  
  // Base income
  player.coins += 1;
  
  // Control point bonuses
  for (const cp of state.controlPoints) {
    if (cp.controlledBy === state.currentPlayer) {
      if (cp.type === 'left' || cp.type === 'right') {
        player.coins += 1;
      }
    }
  }
  
  // Actions
  player.actions = 1; // Base action
  
  const centerControlled = state.controlPoints.find(cp => cp.type === 'center');
  if (centerControlled && centerControlled.controlledBy === state.currentPlayer) {
    player.actions += 1;
  }
}

// Move action validation and execution
function applyMove(state: GameState, action: GameAction): ActionResult {
  if (action.type !== 'move') return { success: false, error: 'Invalid action type' };
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  // Check if player has actions
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  const unit = getUnit(newState, action.unitId);
  if (!unit) {
    return { success: false, error: 'Unit not found' };
  }
  
  if (unit.owner !== newState.currentPlayer) {
    return { success: false, error: 'Not your unit' };
  }
  
  const distance = calculateDistance(unit.position, action.to);
  
  // Check movement capacity
  if (distance > unit.stats.move) {
    return { success: false, error: 'Unit cannot move that far' };
  }
  
  // Check if destination is valid
  if (action.to.row < 1 || action.to.row > 5 || action.to.col < 1 || action.to.col > 5) {
    return { success: false, error: 'Invalid destination' };
  }
  
  // Check if destination is empty
  if (getUnitAt(newState, action.to)) {
    return { success: false, error: 'Destination occupied' };
  }
  
  // Execute move
  setUnitAt(newState, unit.position, null);
  unit.position = { ...action.to };
  setUnitAt(newState, action.to, unit);
  
  player.actions -= 1;
  updateControlPoints(newState);
  
  return { success: true, newState };
}

// Attack action validation and execution
function applyAttack(state: GameState, action: GameAction): ActionResult {
  if (action.type !== 'attack') return { success: false, error: 'Invalid action type' };
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  const attacker = getUnit(newState, action.attackerId);
  const target = getUnit(newState, action.targetId);
  
  if (!attacker || !target) {
    return { success: false, error: 'Unit not found' };
  }
  
  if (attacker.owner !== newState.currentPlayer) {
    return { success: false, error: 'Not your unit' };
  }
  
  if (target.owner === newState.currentPlayer) {
    return { success: false, error: 'Cannot attack own unit' };
  }
  
  const distance = calculateDistance(attacker.position, target.position);
  
  if (distance > attacker.stats.range) {
    return { success: false, error: 'Target out of range' };
  }
  
  // Calculate damage
  const damage = Math.max(attacker.stats.atk - target.stats.def, 1);
  target.stats.hp -= damage;
  
  // Remove if dead
  if (target.stats.hp <= 0) {
    setUnitAt(newState, target.position, null);
  }
  
  player.actions -= 1;
  updateControlPoints(newState);
  
  return { success: true, newState };
}

// Swap action validation and execution
function applySwap(state: GameState, action: GameAction): ActionResult {
  if (action.type !== 'swap') return { success: false, error: 'Invalid action type' };
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  const unit1 = getUnit(newState, action.unitId1);
  const unit2 = getUnit(newState, action.unitId2);
  
  if (!unit1 || !unit2) {
    return { success: false, error: 'Unit not found' };
  }
  
  if (unit1.owner !== newState.currentPlayer || unit2.owner !== newState.currentPlayer) {
    return { success: false, error: 'Not your units' };
  }
  
  if (!areAdjacent(unit1.position, unit2.position)) {
    return { success: false, error: 'Units not adjacent' };
  }
  
  // Swap positions
  const temp = { ...unit1.position };
  unit1.position = { ...unit2.position };
  unit2.position = temp;
  
  setUnitAt(newState, unit1.position, unit1);
  setUnitAt(newState, unit2.position, unit2);
  
  player.actions -= 1;
  updateControlPoints(newState);
  
  return { success: true, newState };
}

// Play card action
function applyPlayCard(state: GameState, action: GameAction): ActionResult {
  if (action.type !== 'play_card') return { success: false, error: 'Invalid action type' };
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
  if (cardIndex === -1) {
    return { success: false, error: 'Card not in hand' };
  }
  
  const card = player.hand[cardIndex];
  
  if (player.coins < card.cost) {
    return { success: false, error: 'Not enough coins' };
  }
  
  // Remove card from hand
  player.hand.splice(cardIndex, 1);
  player.coins -= card.cost;
  player.actions -= 1;
  
  if (card.type === 'unit') {
    // Spawn unit
    if (!action.spawnCol || action.spawnCol < 1 || action.spawnCol > 5) {
      return { success: false, error: 'Invalid spawn column' };
    }
    
    const spawnRow = newState.currentPlayer === 'A' ? 1 : 5;
    const spawnPos = { row: spawnRow, col: action.spawnCol };
    
    if (getUnitAt(newState, spawnPos)) {
      return { success: false, error: 'Spawn position occupied' };
    }
    
    const newUnit: Unit = {
      id: `unit-${unitIdCounter++}`,
      owner: newState.currentPlayer,
      position: spawnPos,
      stats: { ...card.unitStats! },
      name: card.name
    };
    
    setUnitAt(newState, spawnPos, newUnit);
    player.discard.push(card);
    
  } else if (card.type === 'spell') {
    // Execute spell
    if (card.spellEffect === 'lightning_strike') {
      if (!action.targetUnitId) {
        return { success: false, error: 'No target specified' };
      }
      
      const target = getUnit(newState, action.targetUnitId);
      if (!target) {
        return { success: false, error: 'Target not found' };
      }
      
      // Deal 5 damage, ignore DEF
      target.stats.hp -= 5;
      
      if (target.stats.hp <= 0) {
        setUnitAt(newState, target.position, null);
      }
      
    } else if (card.spellEffect === 'healing_circle') {
      if (!action.targetPosition) {
        return { success: false, error: 'No target position specified' };
      }
      
      // Heal units at target and orthogonally adjacent
      const positions = [
        action.targetPosition,
        { row: action.targetPosition.row - 1, col: action.targetPosition.col },
        { row: action.targetPosition.row + 1, col: action.targetPosition.col },
        { row: action.targetPosition.row, col: action.targetPosition.col - 1 },
        { row: action.targetPosition.row, col: action.targetPosition.col + 1 }
      ];
      
      for (const pos of positions) {
        const unit = getUnitAt(newState, pos);
        if (unit && unit.owner === newState.currentPlayer) {
          unit.stats.hp = unit.stats.maxHp;
        }
      }
      
    } else if (card.spellEffect === 'recruitment') {
      // Search deck for a card (for now, simplified: draw from deck if available)
      // Full implementation would require client to select a card
      return { success: false, error: 'Recruitment not yet implemented' };
    }
    
    player.discard.push(card);
  }
  
  updateControlPoints(newState);
  return { success: true, newState };
}

// Draw card action
function applyDrawCard(state: GameState): ActionResult {
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  if (player.hand.length >= 5) {
    return { success: false, error: 'Hand full' };
  }
  
  if (player.deck.length === 0) {
    // Shuffle discard into deck
    player.deck = [...player.discard];
    player.discard = [];
    
    // Shuffle
    for (let i = player.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [player.deck[i], player.deck[j]] = [player.deck[j], player.deck[i]];
    }
  }
  
  if (player.deck.length === 0) {
    return { success: false, error: 'No cards to draw' };
  }
  
  const card = player.deck.pop()!;
  player.hand.push(card);
  player.actions -= 1;
  
  return { success: true, newState };
}

// Sell card action
function applySellCard(state: GameState, action: GameAction): ActionResult {
  if (action.type !== 'sell_card') return { success: false, error: 'Invalid action type' };
  
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayer];
  
  if (player.actions < 1) {
    return { success: false, error: 'Not enough actions' };
  }
  
  const cardIndex = player.hand.findIndex(c => c.id === action.cardId);
  if (cardIndex === -1) {
    return { success: false, error: 'Card not in hand' };
  }
  
  player.hand.splice(cardIndex, 1);
  player.coins += 1;
  player.actions -= 1;
  
  return { success: true, newState };
}

// End turn action
function applyEndTurn(state: GameState): ActionResult {
  const newState = cloneState(state);
  
  // Check win condition
  const winner = checkWinCondition(newState);
  if (winner) {
    newState.winner = winner;
    return { success: true, newState };
  }
  
  // Switch player
  newState.currentPlayer = newState.currentPlayer === 'A' ? 'B' : 'A';
  newState.turnNumber += 1;
  
  // Apply start of turn effects
  applyStartOfTurnEffects(newState);
  
  return { success: true, newState };
}

// Main action dispatcher
export function applyAction(state: GameState, action: GameAction): ActionResult {
  if (state.winner) {
    return { success: false, error: 'Game already ended' };
  }
  
  switch (action.type) {
    case 'move':
      return applyMove(state, action);
    case 'attack':
      return applyAttack(state, action);
    case 'swap':
      return applySwap(state, action);
    case 'play_card':
      return applyPlayCard(state, action);
    case 'draw_card':
      return applyDrawCard(state);
    case 'sell_card':
      return applySellCard(state, action);
    case 'end_turn':
      return applyEndTurn(state);
    default:
      return { success: false, error: 'Unknown action type' };
  }
}
