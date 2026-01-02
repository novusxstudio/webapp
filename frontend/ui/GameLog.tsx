import React from 'react';

export interface LogEntry {
  text: string;
}

interface GameLogProps {
  log: LogEntry[];
}

const GameLog: React.FC<GameLogProps> = ({ log }) => (
  <div className="game-log" style={{ maxHeight: 200, overflowY: 'auto', background: '#222', color: '#fff', padding: 8, borderRadius: 8, fontSize: 14 }}>
    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Game Log</div>
    {log.length === 0 ? <div>No actions yet.</div> :
      log.map((entry, i) => <div key={i}>{entry.text}</div>)}
  </div>
);

export default GameLog;
