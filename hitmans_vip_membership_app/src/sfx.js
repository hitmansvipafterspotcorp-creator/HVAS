// Game-show sound effects, synthesized in the browser with Web Audio.
//
// Deliberately NOT sampled audio files: this is a commercial venue app, and
// shipping SFX pulled from a sound library would drag licensing along with it.
// Synthesis has none of that, adds zero bytes to the asset payload, needs no
// preloading (so the first buzzer isn't a 300ms wait), and can be retuned in
// code instead of re-cutting a wav.
//
// Everything is built from oscillators + gain envelopes through one shared
// AudioContext, created lazily on first play — browsers refuse to start an
// AudioContext before a user gesture, and creating it at import time leaves a
// permanently suspended context that never makes a sound.

const MUTE_KEY = 'hvas_sfx_muted';

let ctx = null;
const audio = () => {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  // Autoplay policies suspend the context until a gesture; every play attempt
  // nudges it, so the first tap after page load isn't silently dropped.
  if (ctx.state === 'suspended') ctx.resume?.().catch(() => {});
  return ctx;
};

export const sfxMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
};
export const setSfxMuted = (muted) => {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* ignore */ }
};

// One tone with an attack/decay envelope. `when` is an offset in seconds so
// notes can be sequenced into arpeggios without setTimeout drift.
function tone(c, { freq, start = 0, dur = 0.18, type = 'sine', gain = 0.18, slideTo = null }) {
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  // short attack then exponential decay — a click-free "plink"
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

// Filtered white noise — the body of applause/crowd swells.
function noise(c, { start = 0, dur = 0.5, gain = 0.12, from = 400, to = 2400 }) {
  const t0 = c.currentTime + start;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass';
  bp.frequency.setValueAtTime(from, t0);
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp); bp.connect(g); g.connect(c.destination);
  src.start(t0); src.stop(t0 + dur);
}

const SFX = {
  // a square you tapped is now covered — short confirming bell
  mark: (c) => { tone(c, { freq: 880, dur: 0.12, type: 'triangle', gain: 0.16 }); tone(c, { freq: 1320, start: 0.05, dur: 0.14, type: 'sine', gain: 0.12 }); },
  // a new song hits the TV — three-note "next up" sting
  call: (c) => { [523.25, 659.25, 783.99].forEach((f, i) => tone(c, { freq: f, start: i * 0.075, dur: 0.2, type: 'triangle', gain: 0.15 })); },
  // you took a round — rising major arpeggio + a crowd swell
  round: (c) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { freq: f, start: i * 0.09, dur: 0.3, type: 'sawtooth', gain: 0.1 })); noise(c, { start: 0.15, dur: 0.7, gain: 0.09 }); },
  // BINGO — full fanfare, the loudest thing in the game
  win: (c) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, { freq: f, start: i * 0.085, dur: 0.42, type: 'sawtooth', gain: 0.12 }));
    tone(c, { freq: 1046.5, start: 0.5, dur: 0.75, type: 'triangle', gain: 0.16 });
    noise(c, { start: 0.35, dur: 1.3, gain: 0.13 });
  },
  // rejected claim / denied — classic descending game-show buzzer
  buzz: (c) => { tone(c, { freq: 220, dur: 0.42, type: 'square', gain: 0.13, slideTo: 110 }); },
  // final seconds of a performance window
  tick: (c) => { tone(c, { freq: 1200, dur: 0.05, type: 'square', gain: 0.07 }); },
  // a lip sync battle is starting — dramatic riser
  battle: (c) => { tone(c, { freq: 196, dur: 0.9, type: 'sawtooth', gain: 0.11, slideTo: 880 }); noise(c, { start: 0.4, dur: 0.6, gain: 0.1, from: 300, to: 4000 }); },
};

export function playSfx(name) {
  if (sfxMuted()) return;
  const c = audio();
  if (!c || !SFX[name]) return;
  // A dud oscillator must never take down the UI that triggered it.
  try { SFX[name](c); } catch { /* ignore */ }
}

export const SFX_NAMES = Object.keys(SFX);
