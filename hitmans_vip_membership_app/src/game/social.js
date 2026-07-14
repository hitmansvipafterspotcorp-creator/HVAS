// Social client for the top-down venues — presence, chat, and linking over the
// HVAS backend mesh. Talks to VITE_HVAS_API with the member's backend session
// token (localStorage `hvas_api_token`). When neither is present it's fully
// dormant, so the game runs solo with zero backend and the static build works.
//
// SSE is read via fetch streaming (EventSource can't send auth headers).
// Backend base URL is resolved at runtime (connected venue → build env).
import { apiBase } from '../api.js';
import { hubOn, hubNode } from '../hub.js';
const API = () => apiBase();
const token = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_token')) || '';
const me = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_member_id')) || 'me-' + (localStorage.getItem('hvas_self') || (localStorage.setItem('hvas_self', Math.random().toString(36).slice(2, 8)), localStorage.getItem('hvas_self')));
export const socialEnabled = () => (hubOn() && !!hubNode()) || !!(API() && token());

const headers = () => ({ Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' });

async function streamSSE(path, onEvent, signal) {
  try {
    const res = await fetch(API() + path, { headers: headers(), signal });
    if (!res.ok || !res.body) return;
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2);
        if (line.startsWith('data:')) { try { onEvent(JSON.parse(line.slice(5).trim())); } catch { /* skip */ } }
      }
    }
  } catch { /* aborted or offline — solo */ }
}

// Join a venue: stream who's here (with their top-down avatar) + incoming chat,
// and expose ping()/say(). Returns a handle with a leave().
export function joinVenue(venueId, { onMembers, onChat, onLink } = {}) {
  if (!socialEnabled()) return { ping() {}, say() {}, link() {}, leave() {} };

  // Hub mode: peer-to-peer over the in-browser mesh node — no server.
  if (hubOn() && hubNode()) {
    const hub = hubNode(); const self = me();
    const seen = new Map();                     // memberId -> {…, ts}
    const emit = () => {
      const now = Date.now();
      const list = [...seen.values()].filter((p) => now - p.ts < 15000 && p.venue === venueId);
      onMembers && onMembers(list);
    };
    const onLive = (p) => { if (p?.type === 'presence' && p.id !== self) { seen.set(p.id, { ...p, ts: Date.now() }); emit(); } };
    const onCh = (op) => {
      if (op.t === 'chat' && onChat && op.data.venue === venueId && op.data.from !== self) onChat({ kind: 'chat', ...op.data });
      if ((op.t === 'link.request' || op.t === 'link.accept') && onLink && op.data.to === self) onLink({ kind: op.t, ...op.data });
    };
    const prevLive = hub.onLive, prevCh = hub.onChange;
    hub.onLive = (p) => { prevLive?.(p); onLive(p); };
    hub.onChange = (op) => { prevCh?.(op); onCh(op); };
    const timer = setInterval(emit, 5000);
    return {
      ping: (avatar, x, y) => hub.live({ type: 'presence', id: self, name: 'Member', number: self, avatar, venue: venueId, x, y }),
      say: (body, to) => hub.apply('chat', { from: self, to: to || null, venue: to ? null : venueId, body, at: Date.now() }),
      link: (to) => hub.apply('link.request', { from: self, to, at: Date.now() }),
      leave: () => { clearInterval(timer); hub.onLive = prevLive; hub.onChange = prevCh; },
    };
  }

  const ac = new AbortController();
  streamSSE(`/venue/stream?venue=${encodeURIComponent(venueId)}`, (e) => { if (e.members && onMembers) onMembers(e.members); }, ac.signal);
  streamSSE('/live/stream', (e) => {
    if (e.kind === 'chat' && onChat) onChat(e);
    else if ((e.kind === 'link.request' || e.kind === 'link.accept') && onLink) onLink(e);
  }, ac.signal);
  const post = (path, body) => fetch(API() + path, { method: 'POST', headers: headers(), body: JSON.stringify(body) }).catch(() => {});
  return {
    ping: (avatar, x, y) => post('/presence', { venue: venueId, avatar, x, y }),
    say: (body, to) => post('/chat', to ? { to, body } : { venue: venueId, body }),
    link: (to) => post('/link', { to }),
    leave: () => ac.abort(),
  };
}
