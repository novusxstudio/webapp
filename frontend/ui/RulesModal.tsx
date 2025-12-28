import React from 'react';

interface RulesModalProps {
  onClose: () => void;
}

export const RulesModal: React.FC<RulesModalProps> = ({ onClose }) => {
  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const modalStyle: React.CSSProperties = {
    width: '90%',
    maxWidth: '800px',
    maxHeight: '80vh',
    overflowY: 'auto',
    backgroundColor: '#1f2937',
    color: '#f9fafb',
    borderRadius: '12px',
    boxShadow: '0 10px 20px rgba(0, 0, 0, 0.4)',
    padding: '24px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    borderBottom: '1px solid #374151',
    paddingBottom: '12px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
  };

  const closeButtonStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: '#374151',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: '18px',
    fontWeight: 700,
    marginTop: '16px',
    marginBottom: '8px',
  };

  const paragraphStyle: React.CSSProperties = {
    lineHeight: 1.6,
    marginBottom: '10px',
  };

  const listStyle: React.CSSProperties = {
    marginLeft: '16px',
    marginBottom: '10px',
  };

  return (
    <div style={overlayStyle}>
      <div role="dialog" aria-modal="true" style={modalStyle}>
        <div style={headerStyle}>
          <span style={titleStyle}>Game Rules</span>
          <button style={closeButtonStyle} onClick={onClose}>Close</button>
        </div>

        <div>
          <h2 style={sectionTitleStyle}>Objective</h2>
          <p style={paragraphStyle}>
            Capture and control all control points or outmaneuver your opponent through strategic unit placement, attacks, and spellcasting.
          </p>

          <h2 style={sectionTitleStyle}>Turn Structure</h2>
          <ul style={listStyle}>
            <li>Each player begins their turn with 1 action.</li>
            <li>Actions are spent on moving, attacking, deploying units, casting spells, rotating units, recruiting, drawing, selling, or retrieving from discard (as permitted).</li>
            <li>When actions reach 0, the turn ends automatically.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Board & Units</h2>
          <ul style={listStyle}>
            <li>The board is a 5x5 grid. Units occupy tiles and may face a direction.</li>
            <li>Movement and attack rules depend on unit type; attacks reduce enemy health.</li>
            <li>Rotating a unit changes its facing direction without moving its position.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Cards & Deck</h2>
          <ul style={listStyle}>
            <li>Players have a deck, hand, and discard pile. You draw cards at game start.</li>
            <li>Unit cards can be deployed to empty tiles you control (subject to rules).</li>
            <li>Certain actions may move cards between hand, deck, and discard.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Coins</h2>
          <ul style={listStyle}>
            <li>Coins are used to recruit and perform certain actions.</li>
            <li>Control points and specific effects may grant bonus coins at turn start.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Control Points</h2>
          <ul style={listStyle}>
            <li>Tiles marked as control points grant bonuses when controlled.</li>
            <li>Controlling all points can immediately win the game.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Spells</h2>
          <ul style={listStyle}>
            <li>Spells target tiles and show a brief overlay effect when cast.</li>
            <li>Lightning Strike deals damage that ignores defense.</li>
            <li>Healing restores health to friendly units in range.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Recruitment & Other Actions</h2>
          <ul style={listStyle}>
            <li>Recruitment adds units to your deck/hand as specified by the card/effect.</li>
            <li>Retrieve from discard returns a card to hand if allowed.</li>
            <li>Selling a card grants coins according to the rules.</li>
          </ul>

          <h2 style={sectionTitleStyle}>End of Turn</h2>
          <ul style={listStyle}>
            <li>Turns end automatically when actions are depleted, or manually via the HUD button (where allowed).</li>
            <li>Bonuses and effects may apply at the start of the next turn.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Victory</h2>
          <p style={paragraphStyle}>
            You win by controlling all control points or by defeating your opponent through effective use of units, spells, and resources.
          </p>
        </div>
      </div>
    </div>
  );
};
