// Social client for the top-down venues — presence, chat, and linking over the
// HVAS backend mesh. Talks to VITE_HVAS_API with the member's backend session
// token (localStorage `hvas_api_token`). When neither is present it's fully
// dormant, so the game runs solo with zero backend and the static build works.
//
// SSE is read via fetch streaming (EventSource can't send auth headers).
// Backend base URL is resolved at runtime (connected venue → build env).
import { apiBase } from '../api.js';
const API = () => apiBase();
const token = () => (typeof localStorage !== 'undefined' && localStorage.getItem('hvas_api_token')) || '';
export const socialEnabled = () => !!(API() && token());

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
