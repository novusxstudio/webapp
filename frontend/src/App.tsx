import { useState, useRef, useEffect } from 'react';
import './App.css'
import { GameBoard } from '../ui/GameBoard';
import { UnitStatsPanel } from '../ui/UnitStatsPanel';
import { Hand } from '../ui/Hand';
import { HUD } from '../ui/HUD';
import { BackgroundMusic } from '../ui/BackgroundMusic';
import { DeckPicker } from '../ui/DeckPicker';
import { DiscardViewer } from '../ui/DiscardViewer';
import { RulesModal } from '../ui/RulesModal';
import type { GameState, Tile, Unit, Player, Position } from './game/GameState';
import { createInitialGrid } from './game/setup';
import { applyMove, applyAttack, applyDeploy, applySpell, applyRotate, endTurn, controlsAllPoints, sellCard, createDeck, drawCard, canRecruit, applyRecruit, applyRetrieveFromDiscard, getControlBonuses } from './game/rules';
import { CARDS } from './game/cards';
import type { Card } from './game/cards';
import bgImage from './assets/background/Gemini_Generated_Image_u709ybu709ybu709.png';

function App() {
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [winner, setWinner] = useState<number | null>(null);
  const [showDeckPicker, setShowDeckPicker] = useState<boolean>(false);
  const [isDiscardViewerOpen, setIsDiscardViewerOpen] = useState<boolean>(false);
  const [activeSpellOverlay, setActiveSpellOverlay] = useState<{ position: Position; spellType: 'lightning' | 'healing'; ownerId: number } | null>(null);
  const [musicEnabled, setMusicEnabled] = useState<boolean>(true);
  const [isRulesOpen, setIsRulesOpen] = useState<boolean>(false);
  
  const spellTimeoutRef = useRef<number | null>(null);

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (spellTimeoutRef.current !== null) {
        clearTimeout(spellTimeoutRef.current);
      }
    };
  }, []);

  const createInitialGameState = (): GameState => {
    const grid: Tile[][] = createInitialGrid();

    const players: Player[] = [
      {
        id: 0,
        coins: 1,
        actionsRemaining: 1,
        hand: [],
        deck: createDeck(),
        discard: [],
      },
      {
        id: 1,
        coins: 0,
        actionsRemaining: 1,
        hand: [],
        deck: createDeck(),
        discard: [],
      },
    ];

    // Draw 5 starting cards for each player
    players.forEach(player => {
      for (let i = 0; i < 5; i++) {
        if (player.deck.length > 0) {
          const [drawnCard, ...remainingDeck] = player.deck;
          player.hand.push(drawnCard);
          player.deck = remainingDeck;
        }
      }
    });

    return {
      grid,
      players,
      currentPlayer: 0,
      turnNumber: 1,
    };
  };

  const [gameState, setGameState] = useState<GameState>(createInitialGameState());

  // Manual end-turn handler (does not consume an action)
  const endTurnManually = () => {
    if (winner !== null || activeSpellOverlay !== null) return;
    try {
      const newState = endTurn(gameState);
      setGameState(newState);
      // Clear selections
      setSelectedUnitId(null);
      setSelectedUnit(null);
      setSelectedCardId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const toggleMusic = () => {
    setMusicEnabled((prev) => !prev);
  };

  const openRules = () => {
    setIsRulesOpen(true);
  };

  const closeRules = () => {
    setIsRulesOpen(false);
  };

  const handleMove = (unitId: string, target: Position) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    try {
      // Apply move
      let newState = applyMove(gameState, unitId, target);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
            hand: [...player.hand]
          };
        }
        return { ...player, hand: [...player.hand] };
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleAttack = (attackerId: string, targetPos: Position) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    try {
      // Apply attack
      let newState = applyAttack(gameState, attackerId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
            hand: [...player.hand]
          };
        }
        return { ...player, hand: [...player.hand] };
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleSelectUnit = (unit: Unit | null) => {
    if (activeSpellOverlay !== null) return;
    
    if (unit) {
      setSelectedUnitId(unit.id);
      setSelectedUnit(unit);
      setSelectedCardId(null); // Deselect card when selecting unit
    } else {
      setSelectedUnitId(null);
      setSelectedUnit(null);
    }
  };

  const handleSelectCard = (cardId: string | null) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    // If selecting Recruitment card, open deck picker
    if (cardId === 'recruitment') {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      // Check if can recruit
      if (canRecruit(gameState, cardId) && currentPlayer.actionsRemaining > 0) {
        setShowDeckPicker(true);
        setSelectedCardId(cardId);
        setSelectedUnitId(null);
        setSelectedUnit(null);
        return;
      }
    }
    
    setSelectedCardId(cardId);
    if (cardId) {
      // Deselect unit when selecting card
      setSelectedUnitId(null);
      setSelectedUnit(null);
    }
  };

  const handleDeploy = (cardId: string, targetPos: Position) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    try {
      // Apply deployment
      let newState = applyDeploy(gameState, cardId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedCardId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedCardId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleCastSpell = (cardId: string, targetPos: Position) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    try {
      // Apply spell
      let newState = applySpell(gameState, cardId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Set game state immediately to show spell effect
      setGameState(newState);
      setSelectedCardId(null);
      setSelectedUnit(null);
      
      // Determine spell type
      const spellType: 'lightning' | 'healing' = cardId === 'lightningStrike' ? 'lightning' : 'healing';
      
      // Show spell overlay
      setActiveSpellOverlay({ position: targetPos, spellType, ownerId: gameState.currentPlayer });
      
      // Start 1-second timeout
      spellTimeoutRef.current = window.setTimeout(() => {
        // Clear overlay
        setActiveSpellOverlay(null);
        spellTimeoutRef.current = null;
        
        // Check if turn should end
        if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
          // Check win condition before ending turn
          if (controlsAllPoints(newState, currentPlayerIndex)) {
            setWinner(currentPlayerIndex);
            return;
          }
          
          const finalState = endTurn(newState);
          setGameState(finalState);
        }
      }, 1000);
      
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleRotate = (unitId: string, targetPos: Position) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    try {
      // Apply rotate
      let newState = applyRotate(gameState, unitId, targetPos);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedUnitId(null);
          setSelectedUnit(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedUnitId(null);
      setSelectedUnit(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleSellCard = (cardId: string) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    // Check if player has actions remaining
    const currentPlayer = gameState.players[gameState.currentPlayer];
    if (currentPlayer.actionsRemaining <= 0) return;
    
    try {
      // Apply sell
      let newState = sellCard(gameState, cardId);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setSelectedCardId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedCardId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleDrawCard = () => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    // Check if player has actions remaining
    const currentPlayer = gameState.players[gameState.currentPlayer];
    if (currentPlayer.actionsRemaining <= 0) return;
    
    // Check if player has enough coins
    if (currentPlayer.coins < 1) return;
    
    // Check if deck is empty
    if (currentPlayer.deck.length === 0) return;
    
    try {
      // Apply draw
      let newState = drawCard(gameState);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleRecruitCard = (chosenCardId: string) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    if (!selectedCardId) return;
    
    try {
      // Apply recruitment
      let newState = applyRecruit(gameState, selectedCardId, chosenCardId);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          setShowDeckPicker(false);
          setSelectedCardId(null);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setShowDeckPicker(false);
      setSelectedCardId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleCancelDeckPicker = () => {
    setShowDeckPicker(false);
    setSelectedCardId(null);
  };

  const handleViewDiscard = () => {
    if (winner !== null || activeSpellOverlay !== null) return;
    setIsDiscardViewerOpen(true);
  };

  const handleRetrieveFromDiscard = (cardId: string) => {
    if (winner !== null || activeSpellOverlay !== null) return;
    
    // Check if player has actions remaining
    const currentPlayer = gameState.players[gameState.currentPlayer];
    if (currentPlayer.actionsRemaining <= 0) return;
    
    try {
      // Apply retrieval
      let newState = applyRetrieveFromDiscard(gameState, cardId);
      
      // Decrement actions
      const currentPlayerIndex = newState.currentPlayer;
      const updatedPlayers = newState.players.map((player, index) => {
        if (index === currentPlayerIndex) {
          return {
            ...player,
            actionsRemaining: player.actionsRemaining - 1,
          };
        }
        return player;
      });
      
      newState = {
        ...newState,
        players: updatedPlayers
      };
      
      // Close discard viewer
      setIsDiscardViewerOpen(false);
      
      // Check if turn should end
      if (updatedPlayers[currentPlayerIndex].actionsRemaining <= 0) {
        // Check win condition before ending turn
        if (controlsAllPoints(newState, currentPlayerIndex)) {
          setWinner(currentPlayerIndex);
          setGameState(newState);
          return;
        }
        
        newState = endTurn(newState);
      }
      
      setGameState(newState);
      setSelectedCardId(null);
    } catch (error) {
      // Ignore errors silently
    }
  };

  const handleCloseDiscardViewer = () => {
    setIsDiscardViewerOpen(false);
  };

  const getCurrentPlayerHand = (): Card[] => {
    const currentPlayer = gameState.players[gameState.currentPlayer];
    return currentPlayer.hand.map(cardId => CARDS[cardId]).filter(card => card !== undefined);
  };

  const getCurrentPlayerDiscard = (): Card[] => {
    const currentPlayer = gameState.players[gameState.currentPlayer];
    return currentPlayer.discard.map(cardId => CARDS[cardId]).filter(card => card !== undefined);
  };

  // Compute action mode
  const getActionMode = (): string => {
    if (activeSpellOverlay !== null) {
      return 'Spell Cast';
    }
    if (selectedCardId) {
      const card = CARDS[selectedCardId];
      if (card) {
        if (card.type === 'unit') {
          return 'Deploy';
        } else if (card.type === 'spell') {
          return 'Spell';
        }
      }
    }
    if (selectedUnitId) {
      return 'Unit Action';
    }
    return 'Idle';
  };

  const appStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'center',
    minHeight: '100vh',
    gap: '20px',
    backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url(${bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
  };

  // Full-screen background and overlay styles
  const backgroundRootStyle: React.CSSProperties = {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
  };

  const backgroundImageStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundImage: 'url(/src/assets/background/Gemini_Generated_Image_u709ybu709ybu709.png)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    zIndex: 0,
    pointerEvents: 'none',
  };

  const backgroundOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    zIndex: 1,
    pointerEvents: 'none',
  };

  const gameContainerStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 2,
  };

  const contentStyle: React.CSSProperties = {
    display: 'flex',
    gap: '20px',
    alignItems: 'flex-start',
  };
  const winnerMessageStyle: React.CSSProperties = {
    fontSize: '32px',
    fontWeight: 'bold',
    color: winner === 0 ? '#3b82f6' : '#ef4444',
    textAlign: 'center',
    padding: '20px',
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  };

  return (
    <div style={appStyle}>
      <BackgroundMusic enabled={musicEnabled} />
      <HUD 
        currentPlayer={gameState.currentPlayer}
        turnNumber={gameState.turnNumber}
        actionsRemaining={gameState.players[gameState.currentPlayer].actionsRemaining}
        actionMode={getActionMode()}
        winner={winner}
        coins={gameState.players[gameState.currentPlayer].coins}
        deckSize={gameState.players[gameState.currentPlayer].deck.length}
        handSize={gameState.players[gameState.currentPlayer].hand.length}
        discardSize={gameState.players[gameState.currentPlayer].discard.length}
        gameState={gameState}
        onViewDiscard={handleViewDiscard}
        onEndTurn={endTurnManually}
        isTurnBlocked={activeSpellOverlay !== null || isRulesOpen}
        musicEnabled={musicEnabled}
        onToggleMusic={toggleMusic}
        onOpenRules={openRules}
      />
      {isRulesOpen && (
        <RulesModal onClose={closeRules} />
      )}
      {winner !== null && (
        <div style={winnerMessageStyle}>
          Player {winner} Wins!
        </div>
      )}
      <div style={contentStyle}>
        <GameBoard 
          gameState={gameState}
          selectedUnitId={selectedUnitId}
          selectedCardId={selectedCardId}
          onSelectUnit={handleSelectUnit}
          onMove={handleMove}
          onAttack={handleAttack}
          onDeploy={handleDeploy}
          onCastSpell={handleCastSpell}
          onRotate={handleRotate}
          activeSpellOverlay={activeSpellOverlay}
        />
        <UnitStatsPanel unit={selectedUnit} />
      </div>
      <Hand 
        cards={getCurrentPlayerHand()}
        selectedCardId={selectedCardId}
        onSelectCard={handleSelectCard}
        onSellCard={handleSellCard}
        onDrawCard={handleDrawCard}
        playerCoins={gameState.players[gameState.currentPlayer].coins}
        deckSize={gameState.players[gameState.currentPlayer].deck.length}
        actionsRemaining={gameState.players[gameState.currentPlayer].actionsRemaining}
      />
      {showDeckPicker && (
        <DeckPicker
          deck={gameState.players[gameState.currentPlayer].deck.map(cardId => CARDS[cardId])}
          onChoose={handleRecruitCard}
          onCancel={handleCancelDeckPicker}
        />
      )}
      {isDiscardViewerOpen && (
        <DiscardViewer
          discard={getCurrentPlayerDiscard()}
          coins={gameState.players[gameState.currentPlayer].coins}
          actionsRemaining={gameState.players[gameState.currentPlayer].actionsRemaining}
          onRetrieve={handleRetrieveFromDiscard}
          onClose={handleCloseDiscardViewer}
        />
      )}
    </div>
  );
}

export default App
