import { Card } from '../types';

interface HandProps {
  cards: Card[];
  onCardClick: (cardId: string) => void;
  selectedCard: string | null;
}

export default function Hand({ cards, onCardClick, selectedCard }: HandProps) {
  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-5 rounded-2xl shadow-2xl border-2 border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-lg flex items-center gap-2">
          <span className="text-2xl">🃏</span>
          Hand
        </h3>
        <div className="text-slate-400 text-sm font-semibold">
          {cards.length} / 5
        </div>
      </div>
      <div className="flex gap-3 flex-wrap justify-center">
        {cards.length === 0 ? (
          <div className="text-slate-500 italic py-8">No cards in hand</div>
        ) : (
          cards.map((card, idx) => {
            const isSelected = selectedCard === card.id;
            const isUnit = card.type === 'unit';
            
            return (
              <div
                key={card.id}
                onClick={() => onCardClick(card.id)}
                className={`
                  relative bg-gradient-to-br p-4 rounded-xl cursor-pointer min-w-40 max-w-44
                  border-2 transition-all duration-300 shadow-lg
                  ${
                    isUnit
                      ? 'from-slate-700 to-slate-800 border-slate-500 hover:border-blue-400'
                      : 'from-purple-900 to-purple-800 border-purple-500 hover:border-purple-400'
                  }
                  ${
                    isSelected
                      ? 'border-yellow-400 ring-4 ring-yellow-400/50 scale-105 -translate-y-2 z-10 shadow-yellow-500/50'
                      : 'hover:scale-105 hover:-translate-y-1'
                  }
                `}
                style={{
                  animation: isSelected ? 'pulse-glow 1.5s ease-in-out infinite' : undefined
                }}
              >
                {/* Card type badge */}
                <div className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-full font-bold ${
                  isUnit ? 'bg-blue-500/80' : 'bg-purple-500/80'
                }`}>
                  {isUnit ? '⚔️' : '✨'}
                </div>
                
                {/* Card name */}
                <div className="text-white font-bold text-sm mb-2 pr-6">
                  {card.name}
                </div>
                
                {/* Cost */}
                <div className="flex items-center gap-1 mb-3">
                  <span className="text-yellow-400 text-lg">💰</span>
                  <span className="text-yellow-400 font-bold text-lg">{card.cost}</span>
                </div>
                
                {/* Stats for unit cards */}
                {card.unitStats && (
                  <div className="space-y-1.5 bg-black/30 p-2 rounded-lg">
                    <div className="flex justify-between text-xs">
                      <span className="text-orange-300">⚔ ATK</span>
                      <span className="text-white font-bold">{card.unitStats.atk}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-blue-300">🛡 DEF</span>
                      <span className="text-white font-bold">{card.unitStats.def}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-green-300">❤️ HP</span>
                      <span className="text-white font-bold">{card.unitStats.hp}</span>
                    </div>
                    <div className="flex justify-between text-xs border-t border-slate-600 pt-1.5">
                      <span className="text-slate-300">🏃 Move</span>
                      <span className="text-white font-bold">{card.unitStats.move}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">🎯 Range</span>
                      <span className="text-white font-bold">{card.unitStats.range}</span>
                    </div>
                  </div>
                )}
                
                {/* Spell description */}
                {!card.unitStats && card.spellEffect && (
                  <div className="text-xs text-purple-200 bg-black/30 p-2 rounded-lg italic">
                    {card.spellEffect === 'lightning_strike' && 'Deal 5 damage (ignores DEF)'}
                    {card.spellEffect === 'healing_circle' && 'Heal units in area'}
                    {card.spellEffect === 'recruitment' && 'Search deck for a card'}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
