// Social layer test — two members on two meshed nodes network, link, and chat
// in a top-down venue, plus live delivery (RTC signaling / snaps). Proves the
// member-to-member social features work peer-to-peer over the encrypted mesh.
import { createApp } from './src/app.mjs';
import { onboard } from './test-helpers.mjs';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';

const { privateKey } = generateKeyPairSync('ed25519');
const venuePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
const meshKey = randomBytes(32), sessKey = randomBytes(32);
const seed = (dir) => { mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/venue-key.json`, JSON.stringify({ privatePem: venuePem })); writeFileSync(`${dir}/mesh.key`, meshKey); writeFileSync(`${dir}/session.key`, sessKey); };
const dirA = `/tmp/hvas-nA-${Date.now()}`, dirB = `/tmp/hvas-nB-${Date.now()}`; seed(dirA); seed(dirB);

const MESH = 9955;
const A = createApp({ dataDir: dirA, nodeId: 'nA', meshPort: MESH });
const B = createApp({ dataDir: dirB, nodeId: 'nB', peers: [`127.0.0.1:${MESH}`] });
await new Promise((r) => A.server.listen(0, r));
await new Promise((r) => B.server.listen(0, r));
const uA = `http://127.0.0.1:${A.server.address().port}`, uB = `http://127.0.0.1:${B.server.address().port}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (url, m, path, body, token) => { const r = await fetch(url + path, { method: m, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
// Minimal SSE reader: collects parsed data events into an array.
async function sse(url, path, token) {
  const events = [];
  const ctrl = new AbortController();
  fetch(url + path, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal }).then(async (r) => {
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
      let i; while ((i = buf.indexOf('\n\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 2); if (line.startsWith('data:')) { try { events.push(JSON.parse(line.slice(5).trim())); } catch {} } } }
  }).catch(() => {});
  return { events, stop: () => ctrl.abort() };
}
const signup = async (url, contact, name) => { const s = await call(url, 'POST', '/auth/member/start', { contact }); const v = await call(url, 'POST', '/auth/member/verify', { contact, code: s.body.devCode, name }); await call(url, 'POST', '/membership/purchase', { tier: 'Monthly', payment: 'x' }, v.body.token); return v.body; };

let pass = 0, fail = 0; const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };
await wait(150);

console.log('TWO MEMBERS IN A TOP-DOWN VENUE');
const tasha = await signup(uA, '850-1', 'Tasha');   // on node A
const marco = await signup(uB, '850-2', 'Marco');   // on node B
await wait(200);
// Marco watches the venue presence stream (on his node B)
const venueFeed = await sse(uB, '/venue/stream?venue=cafe8fifty_interior', marco.token);
await wait(50);
// Tasha shows up as her top-down character
await call(uA, 'POST', '/presence', { venue: 'cafe8fifty_interior', avatar: 'kt', x: 120, y: 80 }, tasha.token);
await wait(250);
const seen = venueFeed.events.at(-1)?.members || [];
ok(seen.some((p) => p.number === tasha.member.number && p.avatar === 'kt'), 'Marco sees Tasha’s KT avatar in the venue (via mesh)');

console.log('\nLINK UP (networking graph)');
await call(uA, 'POST', '/link', { to: marco.member.id }, tasha.token);      // Tasha requests
await wait(200);
let net = await call(uB, 'GET', '/network', null, marco.token);
ok(net.body.connections.some((x) => x.peer === tasha.member.id && x.status === 'pending'), 'Marco sees a pending link from Tasha');
await call(uB, 'POST', '/link/accept', { from: tasha.member.id }, marco.token); // Marco accepts
await wait(200);
net = await call(uA, 'GET', '/network', null, tasha.token);
ok(net.body.connections.some((x) => x.peer === marco.member.id && x.status === 'linked'), 'Tasha sees them linked (converged both ways)');

console.log('\nLIVE CHAT');
const marcoLive = await sse(uB, '/live/stream', marco.token);
await wait(50);
await call(uA, 'POST', '/chat', { to: marco.member.id, body: 'yo we linked 🎉' }, tasha.token);
await wait(250);
ok(marcoLive.events.some((e) => e.kind === 'chat' && e.body === 'yo we linked 🎉'), 'Marco gets the chat live over the mesh');
const hist = await call(uB, 'GET', `/chat/history?peer=${tasha.member.id}`, null, marco.token);
ok(hist.body.messages.some((mm) => mm.body === 'yo we linked 🎉'), 'chat history converged to B (durable)');

console.log('\nLIVE VIDEO SIGNALING + SNAP (over the same pipe, no cloud)');
await call(uA, 'POST', '/live/send', { to: marco.member.id, kind: 'rtc-offer', data: { sdp: 'v=0…', type: 'offer' } }, tasha.token);
await wait(200);
ok(marcoLive.events.some((e) => e.kind === 'rtc-offer' && e.data?.type === 'offer'), 'WebRTC offer relayed to Marco (serverless signaling)');
await call(uA, 'POST', '/live/send', { to: marco.member.id, kind: 'snap', data: { mime: 'image/jpeg', chunk: 0, of: 1, b64: 'AAAA', ttl: 8000 } }, tasha.token);
await wait(200);
ok(marcoLive.events.some((e) => e.kind === 'snap' && e.data?.mime === 'image/jpeg'), 'ephemeral snap chunk delivered to Marco');

console.log(`\n${pass} passed, ${fail} failed`);
venueFeed.stop(); marcoLive.stop();
A.closeMesh(); B.closeMesh(); A.server.close(); B.server.close();
try { rmSync(dirA, { recursive: true, force: true }); rmSync(dirB, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
