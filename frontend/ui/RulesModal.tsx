import React from 'react';

interface RulesModalProps {
  onClose: () => void;
}

/**
 * RulesModal: Overlay with a concise summary of game rules.
 * - Blocks interaction behind it and closes via the provided handler.
 */
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
            Control all control points or tactically eliminate enemy units. No cards, coins, HP, or randomness.
          </p>

          <h2 style={sectionTitleStyle}>Turn Structure</h2>
          <ul style={listStyle}>
            <li>Each player has 1 action per turn.</li>
            <li>Actions: move, attack, or rotate units.</li>
            <li>Turn ends automatically when actions reach 0.</li>
          </ul>

          <h2 style={sectionTitleStyle}>One-Shot Combat</h2>
          <ul style={listStyle}>
            <li>All combat resolves instantly. Units are removed immediately on resolution.</li>
            <li>No HP, damage numbers, or randomness.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Ranged Unit Rules</h2>
          <ul style={listStyle}>
            <li>Archer and Spearman have attack range 2.</li>
            <li>Cannot attack if line-of-sight is blocked by any unit.</li>
            <li>Cannot fire over units.</li>
            <li>Shieldman is immune to ranged attacks.</li>
            <li>Archer ranged: beats Archer, Cavalry, Axeman, Swordsman, Spearman.</li>
            <li>Spearman ranged: beats Archer, Cavalry, Spearman.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Unit Matchups (Melee)</h2>
          <ul style={listStyle}>
            <li>Swordsman beats: Swordsman, Axeman, Cavalry, Archer, Spearman.</li>
            <li>Shieldman beats: Archer.</li>
            <li>Axeman beats: Axeman, Shieldman, Cavalry, Archer, Spearman.</li>
            <li>Cavalry beats: Cavalry, Archer, Spearman.</li>
            <li>Archer beats: Archer (melee only).</li>
            <li>Spearman beats: Spearman, Shieldman, Cavalry, Archer.</li>
          </ul>

          <h2 style={sectionTitleStyle}>Board</h2>
          <ul style={listStyle}>
            <li>5x5 grid with control points. Controlling all points wins.</li>
            <li>Movement and attack ranges depend on unit type.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
