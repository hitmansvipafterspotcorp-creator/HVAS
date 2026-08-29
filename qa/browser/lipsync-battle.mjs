// Browser smoke test for the standalone Lip Sync Battle screen.
// Real Chromium over CDP (Node's built-in WebSocket), driving the app the way a
// person does: sign in with a real OTP, walk to the screen, tap the buttons.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.HVAS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = new URL('../../hitmans_vip_membership_app/dist', import.meta.url).pathname;
const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const web = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]).replace(/^\/HVAS/, '') || '/';
  if (p === '/' || !extname(p)) p = '/index.html';
  try { const b = await readFile(join(APP, normalize(p)));
    res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404).end('no'); }
});
await new Promise((r) => web.listen(0, r));
const appUrl = `http://127.0.0.1:${web.address().port}/HVAS/`;

process.env.HVAS_HOST_CODE = 'HOST850';
const { createApp } = await import(new URL('../../server/src/app.mjs', import.meta.url).href);
const { onboard } = await import(new URL('../../server/test-helpers.mjs', import.meta.url).href);
const { server } = createApp({ dataDir: `/tmp/hvas-ui-${Date.now()}` });
await new Promise((r) => server.listen(0, r));
const api = `http://127.0.0.1:${server.address().port}`;
const call = async (m, path, body, token) => {
  const r = await fetch(api + path, { method: m,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => ({}));
};
const hostTok = (await call('POST', '/auth/staff', { code: 'HOST850' })).token;

const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--remote-debugging-port=9335', `--user-data-dir=/tmp/cdp-${Date.now()}`, '--window-size=932,430',
  // The app's screen transition runs on requestAnimationFrame for 3.6s;
  // headless throttles rAF in a backgrounded window, so it never commits.
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion',
  'about:blank'],
  { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:9335/json/list')).json();
    const p = l.find((t) => t.type === 'page'); if (p?.webSocketDebuggerUrl) { wsUrl = p.webSocketDebuggerUrl; break; } } catch {}
  await new Promise((r) => setTimeout(r, 300));
}
if (!wsUrl) { console.error('chromium never came up'); process.exit(1); }
const ws = new WebSocket(wsUrl);
await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
let mid = 0; const waiting = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((res) => { const i = ++mid; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: `(()=>{${expr}})()`, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return { __err: String(r.result.exceptionDetails.text || '').slice(0, 200) };
  return r.result?.result?.value;
};
const go = (url) => cdp('Page.navigate', { url });
// The app ships a service worker; without this the browser keeps serving the
// bundle it cached on the first load and never sees a rebuild.
const jsAsync = async (expr) => {
  const r = await cdp('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value;
};
const dropServiceWorker = () => jsAsync(`
  if (navigator.serviceWorker) {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  }
  if (window.caches) { for (const k of await caches.keys()) await caches.delete(k); }
  return true;`);
const settle = (ms = 1200) => new Promise((r) => setTimeout(r, ms));
// Play screens are landscape-only now; sign-in happens upright, the game does not.
const rotate = (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h,
  deviceScaleFactor: 2, mobile: true,
  screenOrientation: { type: w > h ? 'landscapePrimary' : 'portraitPrimary', angle: w > h ? 90 : 0 } });
const text = async () => (await js('return document.body ? document.body.innerText : ""')) || '';
// React ignores a plain .value assignment; go through the native setter and
// fire the event React actually listens for.
const fill = (placeholder, value) => js(`
  const el = [...document.querySelectorAll('input')].find((i) => (i.placeholder||'').includes(${JSON.stringify(placeholder)}));
  if (!el) return false;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  set.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;`);
const tap = (needle) => js(`
  const t = ${JSON.stringify(needle)}.toLowerCase();
  const el = [...document.querySelectorAll('button, .ev-format')]
    .find((b) => (b.innerText||'').toLowerCase().includes(t) && !b.disabled && b.offsetParent);
  if (!el) return false; el.click(); return true;`);
// Buttons first: the app wraps most tappable rows in a div that also contains
// the text, and clicking the wrapper does nothing.
const tapAny = (needle) => js(`
  const t = ${JSON.stringify(needle)}.toLowerCase();
  const hit = (sel) => [...document.querySelectorAll(sel)]
    .find((b) => (b.innerText||'').toLowerCase().includes(t) && b.offsetParent && (b.innerText||'').length < 220);
  const el = hit('button') || hit('a,[role="button"]') || hit('li,article,div');
  if (!el) return false; el.click(); return true;`);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// Point the app at the backend and switch off local hub mode, the way
// "connect to venue" does.
await go(appUrl); await settle(2200);
await dropServiceWorker();
await js(`localStorage.setItem('hvas_api_base', ${JSON.stringify(api)});
          localStorage.setItem('hvas_hub_off','1'); localStorage.removeItem('hvas_hub'); return 1;`);
await go(appUrl); await settle(1500);
await dropServiceWorker();
await go(appUrl); await settle(2500);

console.log('SIGN IN — the app\'s own OTP flow');
await tapAny('Member Sign In'); await settle(1200);
await fill('First name', 'Rico');
await fill('(850)', '850-900-0777');
await settle(300);
// One tap. When the venue echoes the code back rather than sending it, nothing
// was confirmed by making the member retype it — so sign-in finishes here. A
// venue that really sends an SMS returns no code and still shows the code
// screen, which is why the fallback below is kept rather than deleted.
ok(await tap('Continue'), 'the sign-in form takes a name and number');
await settle(2500);
if (/6-digit code|enter code/i.test(await text())) {
  const dev = (await call('POST', '/auth/member/start', { contact: '850-900-0777' })).devCode;
  await fill('000000', String(dev)); await settle(300);
  await tap('Verify') || await tap('Continue') || await tap('Enter');
  await settle(2200);
}
let body = await text();
ok(!/Member Sign In/i.test(body), 'signed in — the door screen is behind us');

// Signing in is not membership. A new member now meets the covenant, the trade
// list and the programmes before the app opens, so this suite walks that the
// same way somebody actually would — three taps, on screen, not through the API.
if (/Community Covenant/i.test(body)) {
  await tap('I agree'); await settle(1800);
  await js(`const b=[...document.querySelectorAll('.onb-group')].find(b=>/Here for the room/.test(b.innerText));if(b)b.click();return !!b;`);
  await settle(900);
  await js(`const b=[...document.querySelectorAll('.onb-role')].find(b=>/Just here for the night/.test(b.innerText));if(b)b.click();return !!b;`);
  await settle(1800);
  await js(`const b=document.querySelector('.prog-card');if(b)b.click();return !!b;`);
  await settle(2500);
  // Dues are the fourth step and the last one. This suite walked the first
  // three and then asserted the app was open, which stopped being true the day
  // membership moved to the end of joining — it had been parking on "Choose
  // your membership" ever since, failing every check below it.
  await js(`const b=document.querySelector('.onb-tier');if(b)b.click();return !!b;`);
  await settle(2500);
  body = await text();
  ok(!/Choose your membership/i.test(body), 'and through sign-up — the app is open');
}

// The host opens an event server-side; the member's screen must reflect it.
const created = await call('POST', '/lipsync/create', { format: 'bracket', title: 'Smoke Bracket', size: 8 }, hostTok);
ok(!!created.event, 'backend accepted the event the member screen will show');

console.log('\nMEMBER — the Lip Sync Battle screen');
await rotate(932, 430);   // turn the phone — play is sideways
await settle(1200);
// Battle is no longer a tile on the member menu — the member menu is down to
// My Pass, Lip Sync Bingo and History, and battles happen inside a round. The
// standalone screen is now where the person running the night finds it: Lip
// Sync Bingo -> Host controls (behind the venue's host code) -> Other tools.
// That is the path a real host walks, so it is the path this walks.
const openBingo = () => js(`
  const b = document.querySelector('[data-target="lobby"]');
  if (!b) return false; b.click(); return true;`);
// The app plays a ~9.5s boot transition, and navigate() refuses to move while
// any transition is running — so tap until it actually takes.
let inBingo = false;
for (let i = 0; i < 18 && !inBingo; i++) {
  await openBingo();
  await settle(1500);
  inBingo = await js(`return !!document.querySelector('.play-steps, .bingo-host-link')`);
}
ok(inBingo, 'Lip Sync Bingo opens');
await tap('Host controls'); await settle(1200);
// The host code gate. Unlocking here is what a host does once a night.
await js(`const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').toLowerCase().includes('host code'));
  if(!el)return false;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,'HOST850');
  el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
await settle(400);
await tap('Unlock hosting'); await settle(2000);
// "Other tools" is a <details>; open it before its buttons can be tapped.
await js(`const d=document.querySelector('.host-more'); if(d) d.open = true; return !!d;`);
await settle(400);
let opened = false;
for (let i = 0; i < 12 && !opened; i++) {
  await tap('Lip Sync Battle —') || await tap('Lip Sync Battle');
  await settle(1500);
  opened = /lobby open|Seeded knockout|No battle running/i.test(await text());
}
ok(opened, 'Host controls reach the Lip Sync Battle screen');
body = await text();
ok(/Lip Sync Battle|Smoke Bracket/i.test(body), 'the Lip Sync Battle screen opens from the app');
ok(/lobby open/i.test(body), 'it shows the live lobby the host opened');
ok(/Seeded knockout|Lose once/i.test(body), 'the format is explained on screen');
ok(!/Open the lobby/i.test(body), 'members are not shown host-only controls');
ok(await tap("I'm in"), 'the member gets a sign-up button');
await settle(2600);
body = await text();
ok(/Rico/i.test(body), 'signing up puts the member on the visible roster');
ok(/Leave the lobby/i.test(body), 'the button flips to Leave once joined');
// And the server agrees.
const st = await call('GET', '/lipsync/state', null, hostTok);
ok(st.event?.roster?.some((p) => p.name === 'Rico'), 'the join reached the backend, not just the screen');

console.log('\nMEMBER — a live bout takes over the screen');
const other = await (async () => {
  const s = await call('POST', '/auth/member/start', { contact: '850-900-0888' });
  const v = await call('POST', '/auth/member/verify', { contact: '850-900-0888', code: s.devCode, name: 'Nova' });
  // Signing in is not membership — the venue refuses a join until they are in.
  await onboard(call, v.token);
  return v;
})();
await call('POST', '/lipsync/join', {}, other.token);
await call('POST', '/lipsync/start', {}, hostTok);
await settle(3500);
body = await text();
ok(/Rico|Nova/i.test(body) && /Lip Sync Battle/i.test(body), 'the bout appears on the member screen');
ok(/Accept|Decline|perform/i.test(body), 'the member is offered the bout controls');

console.log('\nLEAVE GUARD');
ok(!/Leave the lobby/i.test(body), 'no "leave" once the event is running');

const errs = await js(`return document.querySelector('.roster-err') ? document.querySelector('.roster-err').innerText : ''`);
ok(!errs, `no error shown on screen${errs ? `: ${errs}` : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('\n--- screen text ---\n' + body.slice(0, 1400));
try { ws.close(); } catch {}
chrome.kill(); server.close(); web.close();
process.exit(fail ? 1 : 0);
