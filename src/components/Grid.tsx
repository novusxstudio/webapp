import { Unit as UnitType, Position, ControlPoint } from '../types';
import Unit from './Unit';

interface GridProps {
  board: (UnitType | null)[][];
  controlPoints: ControlPoint[];
  selectedUnit: string | null;
  onCellClick: (row: number, col: number) => void;
  onUnitClick: (unitId: string) => void;
}

export default function Grid({ 
  board, 
  controlPoints, 
  selectedUnit, 
  onCellClick, 
  onUnitClick 
}: GridProps) {
  const getControlPoint = (row: number, col: number): ControlPoint | undefined => {
    return controlPoints.find(cp => cp.position.row === row && cp.position.col === col);
  };

  return (
    <div className="inline-block bg-gradient-to-br from-slate-800 to-slate-900 p-6 rounded-2xl shadow-2xl border-2 border-slate-700">
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, rowIdx) => {
          const row = rowIdx + 1;
          return Array.from({ length: 5 }, (_, colIdx) => {
            const col = colIdx + 1;
            const unit = board[rowIdx][colIdx];
            const cp = getControlPoint(row, col);
            
            let bgColor = 'bg-slate-700/50';
            let borderColor = 'border-slate-600';
            let glowClass = '';
            
            if (cp) {
              if (cp.controlledBy === 'A') {
                bgColor = 'bg-blue-900/60';
                borderColor = 'border-blue-500';
                glowClass = 'shadow-lg shadow-blue-500/50';
              } else if (cp.controlledBy === 'B') {
                bgColor = 'bg-red-900/60';
                borderColor = 'border-red-500';
                glowClass = 'shadow-lg shadow-red-500/50';
              } else {
                bgColor = 'bg-yellow-900/60';
                borderColor = 'border-yellow-500';
                glowClass = 'shadow-lg shadow-yellow-500/50';
              }
            }
            
            // Checkerboard pattern
            const isDark = (row + col) % 2 === 0;
            const patternClass = isDark ? 'bg-opacity-70' : 'bg-opacity-50';
            
            return (
              <div
                key={`${row}-${col}`}
                className={`
                  relative w-24 h-24 border-2 ${borderColor} ${bgColor} ${patternClass}
                  cursor-pointer hover:border-slate-400 transition-all duration-200
                  rounded-lg ${glowClass} hover:scale-105 backdrop-blur-sm
                `}
                onClick={() => onCellClick(row, col)}
              >
                {/* Coordinates */}
                <div className="absolute top-1 left-1.5 text-[9px] text-slate-400 font-mono font-semibold">
                  {row},{col}
                </div>
                
                {/* Control point indicator */}
                {cp && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="absolute w-16 h-16 rounded-full border-2 border-dashed animate-spin" 
                         style={{ 
                           borderColor: cp.controlledBy === 'A' ? '#3b82f6' : 
                                       cp.controlledBy === 'B' ? '#ef4444' : '#eab308',
                           animationDuration: '8s'
                         }}
                    />
                    <div className="text-2xl drop-shadow-lg filter z-10">
                      {cp.type === 'left' && '💰'}
                      {cp.type === 'center' && '⚡'}
                      {cp.type === 'right' && '💰'}
                    </div>
                  </div>
                )}
                
                {/* Unit */}
                {unit && (
                  <Unit
                    unit={unit}
                    isSelected={selectedUnit === unit.id}
                    onClick={() => onUnitClick(unit.id)}
                  />
                )}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}
