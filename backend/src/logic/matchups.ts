/**
 * Unit Matchup Comparison System
 * 
 * Computes unit matchup relationships based on strict priority rules:
 * 1. Ranged check - can one unit beat the other at range?
 * 2. Melee check - can one unit beat the other in melee?
 * 3. Movement speed check - does one unit have higher movement speed?
 * 4. Equal - if all checks tie, units are equal
 */

import type { UnitStats } from './GameState';
import { UNIT_DATA } from './units';

// ============================================================================
// Types
// ============================================================================

/** Result of comparing two units */
export type ComparisonResult = 'A_COUNTERS_B' | 'B_COUNTERS_A' | 'EQUAL';

/** Unit type string (e.g., 'Swordsman', 'Archer', etc.) */
export type UnitType = UnitStats['type'];

/** Matchup relationships for a single unit */
export interface UnitMatchups {
  counters: UnitType[];      // Units this unit counters
  equals: UnitType[];        // Units this unit is equal to
  counteredBy: UnitType[];   // Units that counter this unit
}

/** Complete matchup data for all units */
export type AllMatchups = Record<UnitType, UnitMatchups>;

// ============================================================================
// Combat Data (from existing rules.ts)
// ============================================================================

/**
 * Melee combat matchups (Attack Range 1, orthogonal adjacency)
 * If unitA is in MELEE_BEATS[unitB], then unitB can beat unitA in melee
 */
const MELEE_BEATS: Record<UnitType, UnitType[]> = {
  Swordsman: ['Archer', 'Cavalry', 'Axeman', 'Swordsman', 'Spearman'],
  Shieldman: ['Archer'],
  Axeman: ['Archer', 'Shieldman', 'Cavalry', 'Axeman', 'Spearman'],
  Cavalry: ['Archer', 'Cavalry', 'Spearman'],
  Archer: ['Archer'],
  Spearman: ['Archer', 'Shieldman', 'Cavalry', 'Spearman'],
};

/**
 * Ranged combat matchups (Attack Range 2, for Archer and Spearman)
 * Note: Shieldman is immune to ranged attacks
 */
const RANGED_BEATS: Partial<Record<UnitType, UnitType[]>> = {
  Archer: ['Archer', 'Cavalry', 'Axeman', 'Swordsman', 'Spearman'],
  Spearman: ['Archer', 'Cavalry', 'Spearman'],
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if unitA can beat unitB at ranged combat
 * A unit can beat another at range if:
 * - It has ranged attack capability (in RANGED_BEATS)
 * - The target is in its ranged targets list
 * - The target is not immune to ranged (Shieldman)
 * 
 * @param unitA - The attacking unit type
 * @param unitB - The target unit type
 * @returns true if unitA can beat unitB at range
 */
function canBeatRanged(unitA: UnitType, unitB: UnitType): boolean {
  // Shieldman is immune to ranged attacks
  if (unitB === 'Shieldman') {
    return false;
  }
  
  // Check if unitA has ranged capability and can hit unitB
  const rangedTargets = RANGED_BEATS[unitA];
  if (!rangedTargets) {
    return false;
  }
  
  return rangedTargets.includes(unitB);
}

/**
 * Check if unitA can beat unitB in melee combat
 * A unit can beat another in melee if the target is in its melee beats list
 * 
 * @param unitA - The attacking unit type
 * @param unitB - The target unit type
 * @returns true if unitA can beat unitB in melee
 */
function canBeatMelee(unitA: UnitType, unitB: UnitType): boolean {
  const meleeTargets = MELEE_BEATS[unitA];
  if (!meleeTargets) {
    return false;
  }
  
  return meleeTargets.includes(unitB);
}

/**
 * Get the movement speed of a unit type
 * Movement speed is determined by moveRange in UNIT_DATA
 * 
 * @param unitType - The unit type to check
 * @returns The movement range of the unit
 */
function getMovementSpeed(unitType: UnitType): number {
  // Find unit in UNIT_DATA by type
  const unitEntry = Object.values(UNIT_DATA).find(u => u.type === unitType);
  if (!unitEntry) {
    throw new Error(`Unknown unit type: ${unitType}`);
  }
  return unitEntry.moveRange;
}

// ============================================================================
// Core Comparison Function
// ============================================================================

/**
 * Compare two units and determine their matchup relationship.
 * 
 * Comparison rules (strict priority order):
 * 1. Ranged check - If one unit can beat the other at range and the other cannot,
 *    the first unit counters the second.
 * 2. Melee check - If one unit can beat the other in melee and the other cannot,
 *    the first unit counters the second.
 * 3. Movement speed check - If one unit has higher movement speed, it counters
 *    the slower unit.
 * 4. Equal - If movement speed is also equal, the two units are equal.
 * 
 * @param unitA - First unit type to compare
 * @param unitB - Second unit type to compare
 * @returns ComparisonResult indicating the relationship
 */
export function compareUnits(unitA: UnitType, unitB: UnitType): ComparisonResult {
  // -------------------------------------------------------------------------
  // Step 1: Ranged check
  // If one unit can beat the other at range and the other cannot,
  // the first unit counters the second.
  // -------------------------------------------------------------------------
  const aBeatsB_Ranged = canBeatRanged(unitA, unitB);
  const bBeatsA_Ranged = canBeatRanged(unitB, unitA);
  
  if (aBeatsB_Ranged && !bBeatsA_Ranged) {
    // A can beat B at range, B cannot beat A at range -> A counters B
    return 'A_COUNTERS_B';
  }
  if (bBeatsA_Ranged && !aBeatsB_Ranged) {
    // B can beat A at range, A cannot beat B at range -> B counters A
    return 'B_COUNTERS_A';
  }
  // Both can or both cannot beat each other at range -> continue to melee check
  
  // -------------------------------------------------------------------------
  // Step 2: Melee check
  // If one unit can beat the other in melee and the other cannot,
  // the first unit counters the second.
  // -------------------------------------------------------------------------
  const aBeatsB_Melee = canBeatMelee(unitA, unitB);
  const bBeatsA_Melee = canBeatMelee(unitB, unitA);
  
  if (aBeatsB_Melee && !bBeatsA_Melee) {
    // A can beat B in melee, B cannot beat A in melee -> A counters B
    return 'A_COUNTERS_B';
  }
  if (bBeatsA_Melee && !aBeatsB_Melee) {
    // B can beat A in melee, A cannot beat B in melee -> B counters A
    return 'B_COUNTERS_A';
  }
  // Both can or both cannot beat each other in melee -> continue to speed check
  
  // -------------------------------------------------------------------------
  // Step 3: Movement speed check
  // If one unit has higher movement speed, it counters the slower unit.
  // -------------------------------------------------------------------------
  const speedA = getMovementSpeed(unitA);
  const speedB = getMovementSpeed(unitB);
  
  if (speedA > speedB) {
    // A is faster -> A counters B
    return 'A_COUNTERS_B';
  }
  if (speedB > speedA) {
    // B is faster -> B counters A
    return 'B_COUNTERS_A';
  }
  
  // -------------------------------------------------------------------------
  // Step 4: Equal
  // Movement speed is equal, and all other checks tied -> units are equal
  // -------------------------------------------------------------------------
  return 'EQUAL';
}

// ============================================================================
// Matchup Computation
// ============================================================================

/**
 * Get all unit types in the game
 * 
 * @returns Array of all unit type strings
 */
export function getAllUnitTypes(): UnitType[] {
  return Object.values(UNIT_DATA).map(u => u.type);
}

/**
 * Compute matchup relationships for all units in the game.
 * 
 * Iterates over all pairs of units, including self-comparisons.
 * Relationships are symmetric and consistent:
 * - If A counters B, then B is countered by A
 * - If A equals B, both list each other as equal
 * - A unit compared with itself is always equal to itself
 * 
 * @returns Complete matchup data for all unit types
 */
export function computeAllMatchups(): AllMatchups {
  const unitTypes = getAllUnitTypes();
  
  // Initialize empty matchup data for each unit type
  const matchups: AllMatchups = {} as AllMatchups;
  for (const unitType of unitTypes) {
    matchups[unitType] = {
      counters: [],
      equals: [],
      counteredBy: [],
    };
  }
  
  // Compare all pairs of units, including self-comparisons
  // We iterate i from 0 to n-1, j from i to n-1 to include self (i === j)
  for (let i = 0; i < unitTypes.length; i++) {
    for (let j = i; j < unitTypes.length; j++) {
      const unitA = unitTypes[i];
      const unitB = unitTypes[j];
      
      // Compare the two units
      const result = compareUnits(unitA, unitB);
      
      // Handle self-comparison (unit compared with itself)
      if (i === j) {
        // A unit is always equal to itself
        matchups[unitA].equals.push(unitA);
        continue;
      }
      
      // Record the relationship symmetrically for different units
      switch (result) {
        case 'A_COUNTERS_B':
          // A counters B, B is countered by A
          matchups[unitA].counters.push(unitB);
          matchups[unitB].counteredBy.push(unitA);
          break;
          
        case 'B_COUNTERS_A':
          // B counters A, A is countered by B
          matchups[unitB].counters.push(unitA);
          matchups[unitA].counteredBy.push(unitB);
          break;
          
        case 'EQUAL':
          // Both are equal to each other
          matchups[unitA].equals.push(unitB);
          matchups[unitB].equals.push(unitA);
          break;
      }
    }
  }
  
  return matchups;
}

/**
 * Get matchup relationships for a specific unit type
 * 
 * @param unitType - The unit type to get matchups for
 * @returns Matchup relationships for the specified unit
 */
export function getMatchupsForUnit(unitType: UnitType): UnitMatchups {
  const allMatchups = computeAllMatchups();
  return allMatchups[unitType];
}

// ============================================================================
// Debug / Display Helpers
// ============================================================================

/**
 * Print all matchups in a human-readable format (for debugging)
 */
export function printAllMatchups(): void {
  const matchups = computeAllMatchups();
  
  console.log('=== Unit Matchup Relationships ===\n');
  
  for (const [unitType, data] of Object.entries(matchups)) {
    console.log(`${unitType}:`);
    console.log(`  Counters: ${data.counters.length > 0 ? data.counters.join(', ') : '(none)'}`);
    console.log(`  Equal to: ${data.equals.length > 0 ? data.equals.join(', ') : '(none)'}`);
    console.log(`  Countered by: ${data.counteredBy.length > 0 ? data.counteredBy.join(', ') : '(none)'}`);
    console.log('');
  }
}
