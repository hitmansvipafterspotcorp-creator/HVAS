// PHONES LEAVE. THE VENUE STAYS UP.
//
// Three endpoints here hold a socket open for as long as a phone is looking at
// them: the door board on a staff device, the member's realtime pipe, and
// presence. In a room, those sockets do not close politely. Somebody walks out
// for a cigarette, the lock screen comes on, the wifi adapter blips — and the
// connection RESETS.
//
// This suite was written expecting to catch a crash, and it did not: it passes
// against the code from before the stream handling was hardened, because
// node's http.Server already owns these sockets and does not let a reset
// become an uncaught exception. That is worth writing down rather than
// quietly deleting — the property is real and the venue depends on it, and
// the next person to look at this should not have to re-derive that it was
// already safe.
//
// So this is a regression guard, not a bug report. A room full of phones
// hanging up must never take the venue down, must never stop the door
// admitting people, and must never silence a staff device that is still
// watching because a different phone left.

import { createApp } from './src/app.mjs';
import { connect } from 'node:net';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-hangup-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;
const API = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, {
    method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const venue = (await call('POST', '/auth/staff', { code: 'HOST850' })).body.token;
const member = async (contact, name) => {
  const s = await call('POST', '/auth/member/start', { contact });
  const v = await call('POST', '/auth/member/verify', { contact, code: s.body.devCode, name });
  const t = v.body.token;
  await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, t);
  await call('POST', '/me/role', { role: 'PATRON' }, t);
  await call('POST', '/me/program', { program: 'HOUSING' }, t);
  await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, t);
  return v.body;
};
const rico = await member('850-777-0001', 'Rico');

// A phone that opens a stream and then has its connection cut from under it —
// a raw socket destroyed mid-stream, which is what a reset looks like to the
// server. fetch() closes politely, so it cannot reproduce this.
const yank = (path, token) => new Promise((res) => {
  const sock = connect(PORT, '127.0.0.1', () => {
    sock.write(`GET ${path} HTTP/1.1\r\nHost: x\r\n`
      + (token ? `Authorization: Bearer ${token}\r\n` : '')
      + `Accept: text/event-stream\r\n\r\n`);
  });
  sock.on('data', () => { setTimeout(() => { sock.destroy(); res(); }, 60); });
  sock.on('error', () => res());
  setTimeout(() => { try { sock.destroy(); } catch {} res(); }, 2500);
});

console.log('A PHONE ON EACH STREAM, CUT OFF MID-SENTENCE');
await yank('/door/stream', venue);
await yank('/live/stream', rico.token);
await yank('/venue/stream?venue=main', rico.token);
await sleep(400);
ok((await call('GET', '/health')).status === 200, 'the venue is still answering after all three were cut off');

console.log('\nAND THE THING THOSE STREAMS EXIST TO DO STILL WORKS');
// Broadcasting is what the dead sockets used to break. Admitting somebody
// pushes the door board to every subscriber, so do it for real.
const p = await call('GET', '/pass/current', null, rico.token);
const at = await call('POST', '/door/verify', { pass: p.body.pass }, venue);
ok(at.body.status === 'granted', 'the door still admits a member');
ok((await call('GET', '/door/board', null, venue)).body.inside.length === 1, 'and the board still shows them inside');

console.log('\nA DEAD SUBSCRIBER DOES NOT SILENCE A LIVE ONE');
// The loop bug: one gone phone used to end the broadcast, so everybody after
// it in the set stopped updating. Hold a real listener open, kill another
// alongside it, and check the survivor is still being told things.
const heard = [];
const listener = connect(PORT, '127.0.0.1', () => {
  listener.write(`GET /door/stream HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${venue}\r\n\r\n`);
});
listener.on('data', (d) => heard.push(String(d)));
listener.on('error', () => {});
await sleep(300);
await yank('/door/stream', venue);          // a second phone, cut off
await sleep(200);
const before = heard.length;
const nova = await member('850-777-0002', 'Nova');
const p2 = await call('GET', '/pass/current', null, nova.token);
await call('POST', '/door/verify', { pass: p2.body.pass }, venue);
await sleep(500);
ok(heard.length > before, 'the staff phone still on the board was told about the new arrival');
ok(heard.join('').includes('Nova'), 'and it was told who it was');
listener.destroy();

console.log('\nAND NOTHING WAS LEFT BEHIND');
await sleep(300);
ok((await call('GET', '/health')).status === 200, 'the venue is still up at the end of all that');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);
