import type { Tile } from './GameState';

export function createInitialGrid(): Tile[][] {
  const grid: Tile[][] = [];
  for (let row = 1; row <= 5; row++) {
    const rowTiles: Tile[] = [];
    for (let col = 1; col <= 5; col++) {
      rowTiles.push({ position: { row, col }, unit: null });
    }
    grid.push(rowTiles);
  }
  return grid;
}
