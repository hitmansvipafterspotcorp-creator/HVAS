import React, { useEffect, useRef, useState } from 'react';
import { makeVenueGame } from './venueGame.js';
import { VENUES, ZONE_ORDER } from './venues.js';

// Mounts the HITMANS VIP QUEST world inside the app: a data-driven venue
// router that swaps between side-scroller exteriors and top-down interiors as
// you travel doors. On-screen A/B/X/Y + D-pad (Y = enter/interact). A dev
// venue selector can jump straight to any of the 19 zones for QA.
const GH = (n) => `${import.meta.env.BASE_URL}assets/game/${n}.png`;

export default function GameCanvas({ fighterId, fighterName, startVenue = 'cafe8fifty_exterior', onExit }) {
  const hostRef = useRef(null);
  const gameRef = useRef(null);
  const [venueId, setVenueId] = useState(startVenue);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [restartN, setRestartN] = useState(0);
  const venue = VENUES[venueId] || VENUES.cafe8fifty_exterior;

  useEffect(() => {
    if (!window.__hvasInput) window.__hvasInput = {};
    const game = makeVenueGame(hostRef.current, {
      fighterId, venueId,
      onPortal: (to) => { if (VENUES[to]) setVenueId(to); },
    });
    gameRef.current = game;
    setPaused(false);
    return () => { game.destroy(true); gameRef.current = null; };
  }, [fighterId, venueId, restartN]);

  const scenes = () => (gameRef.current ? gameRef.current.scene.scenes : []);
  const pause = () => { scenes().forEach((s) => s.scene.isActive() && s.scene.pause()); setPaused(true); };
  const resume = () => { scenes().forEach((s) => s.scene.isPaused() && s.scene.resume()); setPaused(false); };
  const restart = () => { setPaused(false); setRestartN((n) => n + 1); };

  const set = (k, v) => { window.__hvasInput[k] = v; };
  const hold = (k) => ({
    onPointerDown: (e) => { e.preventDefault(); set(k, true); },
    onPointerUp: () => set(k, false), onPointerLeave: () => set(k, false), onPointerCancel: () => set(k, false),
  });
  const tap = (k) => ({ onPointerDown: (e) => { e.preventDefault(); window.__hvasInput[k] = true; } });

  return (
    <div className="game-shell">
      <div className="game-topbar">
        <button type="button" className="game-exit" onClick={onExit}>← Leave</button>
        <span className="game-title">{fighterName} · {venue.name}</span>
        <button type="button" className="game-pause-btn" onClick={pause} aria-label="Pause">❚❚</button>
        <button type="button" className="game-venues" onClick={() => setPickerOpen((o) => !o)}>Venues ▾</button>
      </div>

      <div className="game-stage" ref={hostRef} />

      {paused && (
        <div className="game-pause">
          <div className="gp-panel">
            <img className="gp-banner" src={GH('pause/banner')} alt="Paused" />
            <p className="gp-sub">{fighterName} · {venue.name}</p>
            <button type="button" className="gp-abtn" style={{ backgroundImage: `url("${GH('pause/btn_continue')}")` }} onClick={resume} aria-label="Continue" />
            <button type="button" className="gp-abtn" style={{ backgroundImage: `url("${GH('pause/btn_restart')}")` }} onClick={restart} aria-label="Restart venue" />
            <button type="button" className="gp-abtn gp-quit-btn" style={{ backgroundImage: `url("${GH('pause/btn_quit')}")` }} onClick={onExit} aria-label="Quit to menu"><span>QUIT TO MENU</span></button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="venue-picker" onClick={() => setPickerOpen(false)}>
          <div className="venue-picker-panel" onClick={(e) => e.stopPropagation()}>
            <h3>Travel to a zone <small>({ZONE_ORDER.length})</small></h3>
            <div className="venue-picker-grid">
              {ZONE_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`venue-chip${id === venueId ? ' current' : ''} ${VENUES[id].mode}`}
                  onClick={() => { setVenueId(id); setPickerOpen(false); }}
                >
                  <span className="venue-chip-name">{VENUES[id].name}</span>
                  <span className="venue-chip-mode">{VENUES[id].mode === 'topdown' ? 'inside' : 'street'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="game-controls">
        <div className="dpad">
          <button className="dpad-btn up" aria-label="up" {...hold('up')}>▲</button>
          <button className="dpad-btn left" aria-label="left" {...hold('left')}>◀</button>
          <button className="dpad-btn right" aria-label="right" {...hold('right')}>▶</button>
          <button className="dpad-btn down" aria-label="down" {...hold('down')}>▼</button>
        </div>
        <div className="abxy">
          <button className="btn-y" aria-label="Y enter" {...tap('yQueued')}>Y</button>
          <div className="abxy-mid">
            <button className="btn-x" aria-label="X dodge" {...tap('xQueued')}>X</button>
            <button className="btn-b" aria-label="B special" {...tap('bQueued')}>B</button>
          </div>
          <button className="btn-a" aria-label="A attack" {...tap('attackQueued')}>A</button>
        </div>
      </div>
      <p className="game-hint">D-pad / arrows move · A attack · Y enter doors · Venues ▾ to jump zones</p>
    </div>
  );
}
