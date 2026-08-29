// EVERY ROUTE, FED RUBBISH.
//
// A 500 is not one bug among many. On a phone it reads as "the venue is down",
// and what it sends somebody to do is restart a laptop that was fine — at the
// door, during the night, while people wait. So no route in this building is
// allowed to answer a malformed request with one.
//
// This fires every wrong-shaped body at all of them, as every kind of caller:
// no body at all, a literal null, a bare array, a number, a string, fields that
// are null, fields that are the wrong type, hundred-thousand-character fields,
// path traversal, SQL in a name box, negative money, and numbers past the end
// of the integers. Roughly seven thousand calls.
//
// A refusal is a fine answer. 400, 401, 403, 404, 409, 429 and 503 all say
// something true about the request. Only 5xx is forbidden, because only 5xx
// blames the building for what the caller sent.
import { createApp } from './src/app.mjs';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COVENANT_VERSION } from './src/economy/covenant.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
process.env.HVAS_HOST_CODE = 'HOST850';
const { server } = createApp({ dataDir: `/tmp/hvas-rubbish-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const API = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (c, m) => { console.log(`  ${c ? '✓' : '✗'} ${m}`); c ? pass++ : fail++; };

const call = async (m, p, b, t) => {
  try {
    const r = await fetch(API + p, {
      method: m,
      headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
      body: b === undefined ? undefined : JSON.stringify(b),
    });
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 'THREW', body: String(e) }; }
};
const jcall = async (...a) => { const r = await call(...a); try { return JSON.parse(r.body); } catch { return {}; } };

// Someone of every kind, so a route is tried by a caller allowed to reach it.
const venueTok = (await jcall('POST', '/auth/staff', { code: 'HOST850' })).token;
const inv = await jcall('POST', '/staff/invite', { name: 'Kenya', role: 'host' }, venueTok);
const host = (await jcall('POST', '/auth/staff/claim', { code: inv.code })).token;
const s = await jcall('POST', '/auth/member/start', { contact: '850-555-0101' });
const v = await jcall('POST', '/auth/member/verify', { contact: '850-555-0101', code: s.devCode, name: 'Simone' });
const me = v.token;
await call('POST', '/me/agree', { version: COVENANT_VERSION, agree: true }, me);
await call('POST', '/me/role', { role: 'NAILS' }, me);
await call('POST', '/me/program', { program: 'HOUSING' }, me);
await call('POST', '/membership/purchase', { tier: 'Monthly', payment: 'card' }, me);

const src = readFileSync(resolve(__dirname, 'src/app.mjs'), 'utf8');
const routes = [...src.matchAll(/^    '(GET|POST|PUT|DELETE|PATCH) ([^']+)'/gm)].map((m) => [m[1], m[2]]);
ok(routes.length > 150, `found ${routes.length} routes to try`);

const BODIES = [
  undefined,                                                   // no body at all
  {}, null, [], 'string', 42,                                  // wrong shapes entirely
  { id: null, name: null, code: null, amount: null, tier: null, contact: null },
  { id: {}, name: [], code: {}, amount: 'lots', tier: 99, contact: {} },
  { id: 'x'.repeat(100000), text: 'y'.repeat(100000) },        // a phone that pasted a novel
  { id: '../../etc/passwd', name: "'; DROP TABLE members;--" },
  { amount: -1, price: -999, count: -5 },                      // negative money
  { amount: 1e308, price: Number.MAX_SAFE_INTEGER },
];
const CALLERS = [['nobody', null], ['a member', me], ['the venue code', venueTok],
                 ['a named host', host], ['a forged token', 'garbage.token.here']];

console.log('\nEVERY ROUTE, EVERY WRONG SHAPE, EVERY KIND OF CALLER');
const broke = [];
let calls = 0;
for (const [method, path] of routes) {
  if (/stream$/.test(path)) continue;              // server-sent events: never ends, by design
  for (const [, tok] of CALLERS) {
    for (const body of (method === 'GET' ? [undefined] : BODIES)) {
      calls++;
      const r = await call(method, path, body, tok);
      // 503 is a venue saying a thing it needs was never set up (no Google
      // client id, no YouTube key). That is true, and it is not a crash.
      if (r.status === 'THREW' || (typeof r.status === 'number' && r.status >= 500 && r.status !== 503)) {
        broke.push({ method, path, body: JSON.stringify(body)?.slice(0, 50), status: r.status, err: r.body.slice(0, 140) });
      }
    }
  }
}
ok(calls > 5000, `${calls} calls made`);
ok(broke.length === 0, 'not one of them came back as a server error');
for (const b of broke.slice(0, 12)) console.log(`      ${b.method} ${b.path} <- ${b.body}\n        ${b.status}: ${b.err}`);

console.log('\nTHE TWO SHAPES THAT USED TO BREAK EVERYTHING');
// A body of literal null. JSON.parse('null') is null, which every handler here
// destructures — so one retrying phone or one proxy could 500 any route it hit.
const nulled = await call('POST', '/auth/member/start', null);
ok(nulled.status < 500, `a body of literal null is refused, not a crash (${nulled.status})`);
// A required field that never arrived reaches the database as undefined. That
// is the caller's request being incomplete, and saying 400 is the difference
// between "you left something out" and "the venue is down".
const empty = await call('POST', '/market/close', {}, me);
ok(empty.status === 400, `a missing field comes back as 400, not 500 (${empty.status})`);
ok(/missing something/i.test(empty.body), 'and says so in words a person can act on');

console.log('\nAND THE DOOR STILL REFUSES PROPERLY, NOT LOOSELY');
// Hardening input must never turn a refusal into a shrug.
const t = await jcall('POST', '/door/verify', { number: 'HV-0000-0000' }, venueTok);
ok(t.status === 'trespass', 'a number nobody holds is still trespass');
const u = await jcall('POST', '/door/verify', {}, venueTok);
ok(u.status === 'unreadable', 'and an empty scan is still unreadable, not granted');

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
process.exit(fail ? 1 : 0);
