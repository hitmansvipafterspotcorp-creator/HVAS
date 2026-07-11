import React, { useEffect, useRef } from 'react';
import { makeBrawler, VENUES } from './BrawlerSlice.js';

// Mounts the Phaser brawler inside the app and renders the on-screen
// controls (the fixed A/B/X/Y + D-pad contract). Keyboard also works:
// arrows/WASD move, J attacks.
export default function GameCanvas({ fighterId, fighterName, venueId = 'kingdom_come', onExit }) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const venue = VENUES[venueId] || VENUES.kingdom_come;

  useEffect(() => {
    if (!window.__hvasInput) window.__hvasInput = {};
    const game = makeBrawler(hostRef.current, fighterId, venueId);
    gameRef.current = game;
    return () => { game.destroy(true); gameRef.current = null; };
  }, [fighterId, venueId]);

  const set = (k, v) => { window.__hvasInput[k] = v; };
  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); set(k, true); },
    onPointerUp: () => set(k, false),
    onPointerLeave: () => set(k, false),
    onPointerCancel: () => set(k, false),
  });
  const tap = (k) => ({ onPointerDown: (e) => { e.preventDefault(); window.__hvasInput[k] = true; } });

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <button type="button" className="game-exit" onClick={onExit}>← Leave</button>
        <span className="game-title">{fighterName} · {venue.name}</span>
        <span className="game-goal">{venue.goal}</span>
      </div>

      <div className="game-stage" ref={hostRef} />

      <div className="game-controls">
        <div className="dpad">
          <button className="dpad-btn up" aria-label="up" {...hold('up')}>▲</button>
          <button className="dpad-btn left" aria-label="left" {...hold('left')}>◀</button>
          <button className="dpad-btn right" aria-label="right" {...hold('right')}>▶</button>
          <button className="dpad-btn down" aria-label="down" {...hold('down')}>▼</button>
        </div>
        <div className="abxy">
          <button className="btn-y" aria-label="Y context" {...tap('yQueued')}>Y</button>
          <div className="abxy-mid">
            <button className="btn-x" aria-label="X dodge" {...tap('xQueued')}>X</button>
            <button className="btn-b" aria-label="B special" {...tap('bQueued')}>B</button>
          </div>
          <button className="btn-a" aria-label="A attack" {...tap('attackQueued')}>A</button>
        </div>
      </div>
      <p className="game-hint">D-pad / arrows to move · A (or J) to attack · B/X/Y coming online with full combat</p>
    </div>
  );
}
