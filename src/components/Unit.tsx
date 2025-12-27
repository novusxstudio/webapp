import { Unit as UnitType } from '../types';

interface UnitProps {
  unit: UnitType;
  isSelected: boolean;
  onClick: () => void;
}

export default function Unit({ unit, isSelected, onClick }: UnitProps) {
  const isPlayerA = unit.owner === 'A';
  
  return (
    <div
      onClick={onClick}
      className={`
        absolute inset-1 rounded-lg flex flex-col items-center justify-center cursor-pointer
        text-xs font-bold transition-all duration-200
        ${isPlayerA 
          ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/50' 
          : 'bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/50'
        }
        ${isSelected ? 'ring-4 ring-yellow-400 scale-110 z-10' : 'hover:scale-105'}
        text-white border-2 ${isPlayerA ? 'border-blue-300' : 'border-red-300'}
      `}
      style={{
        animation: isSelected ? 'pulse-glow 1.5s ease-in-out infinite' : undefined
      }}
    >
      {/* Unit name badge */}
      <div className="text-[9px] leading-tight text-center font-semibold px-1 py-0.5 bg-black/30 rounded mb-1 backdrop-blur-sm">
        {unit.name}
      </div>
      
      {/* HP bar */}
      <div className="w-full px-1 mb-1">
        <div className="bg-black/40 rounded-full h-1.5 overflow-hidden">
          <div 
            className={`h-full transition-all ${
              unit.stats.hp / unit.stats.maxHp > 0.5 ? 'bg-green-400' :
              unit.stats.hp / unit.stats.maxHp > 0.25 ? 'bg-yellow-400' : 'bg-red-400'
            }`}
            style={{ width: `${(unit.stats.hp / unit.stats.maxHp) * 100}%` }}
          />
        </div>
        <div className="text-[8px] text-center text-white/90 mt-0.5">
          {unit.stats.hp}/{unit.stats.maxHp} HP
        </div>
      </div>
      
      {/* Stats row */}
      <div className="flex gap-2 text-[9px] bg-black/30 px-2 py-1 rounded backdrop-blur-sm">
        <span title="Attack" className="flex items-center gap-0.5">
          <span className="text-orange-300">⚔</span>{unit.stats.atk}
        </span>
        <span title="Defense" className="flex items-center gap-0.5">
          <span className="text-blue-300">🛡</span>{unit.stats.def}
        </span>
      </div>
      
      {/* Movement and range */}
      <div className="text-[8px] mt-1 flex gap-2 text-white/80">
        <span title="Movement">🏃 {unit.stats.move}</span>
        <span title="Range">🎯 {unit.stats.range}</span>
      </div>
    </div>
  );
}
