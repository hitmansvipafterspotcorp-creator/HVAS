// A sweep for the two failure shapes that keep reaching the venue.
//
// Both bugs found by actually using the app this week were render-level, and
// both were invisible to `npm run build` and to every server suite:
//
//   1. A hook declared below an early return. The venue poll answered
//      'not-connected', the return fired, React counted three hooks become two
//      and unmounted the whole tree. Tapping Lip Sync Bingo with no venue gave
//      a white screen — and took the tab bar and Solo vs CPU down with it.
//
//   2. A control rendered at zero size, or at opacity 0. The QR scanner's
//      camera was mounted in a box that collapsed to 240x0, styled invisible
//      until a class nothing applied. It worked perfectly and showed nothing.
//
// Individual suites pin down individual screens. This one goes wide instead:
// it walks everything a signed-in member can actually reach by tapping, and
// after every single tap asks the same two questions — is the app still
// mounted, and is anything on this screen invisible or unhittable?
//
// It runs with NO venue connected, on purpose. That is the state bug 1 crashed
// in, it is the state most members are in before they join a room, and it is
// the state Solo vs CPU is supposed to work in.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = '/home/claude/hvas/hitmans_vip_membership_app/dist';
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const web = createServer(async (q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/, '') || '/';
  if (p === '/' || !extname(p)) p = '/index.html';
  try { const b = await readFile(join(APP, normalize(p))); s.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); s.end(b); }
  catch { try { const b = await readFile(join('/home/claude/hvas', normalize(p))); s.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); s.end(b); }
          catch { s.writeHead(404).end('no'); } }
});
await new Promise((r) => web.listen(0, r));
const appUrl = `http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT = 9393;
const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cdp-sweep-${Date.now()}`, '--window-size=932,430',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p?.webSocketDebuggerUrl) wsUrl = p.webSocketDebuggerUrl; } catch { /* not up yet */ }
  if (!wsUrl) await new Promise((r) => setTimeout(r, 300));
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const w = new Map();
const errors = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text || '';
    errors.push(String(d).split('\n')[0].slice(0, 200));
  }
});
const cdp = (m, p = {}) => new Promise((res) => { const i = ++id; w.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await cdp('Runtime.enable'); await cdp('Page.enable');
const js = async (e) => {
  const r = await Promise.race([
    cdp('Runtime.evaluate', { expression: `(()=>{${e}})()`, returnByValue: true, awaitPromise: true }),
    new Promise((res) => setTimeout(() => res({ T: 1 }), 15000)),
  ]);
  return r.T ? '<<TIMEOUT>>' : (r.result?.exceptionDetails ? `EXC ${r.result.exceptionDetails.text}` : r.result?.result?.value);
};
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// navigate() refuses while a screen transition is running, and the transition is
// ~3.9s. Tapping inside that window is a no-op that leaves you where you were —
// which had this sweep tapping tiles, staying on the menu, and dutifully
// reporting the menu's own buttons as that screen's tabs. Wait for the overlay
// to actually clear instead of guessing at a sleep.
const waitIdle = async (ms = 14000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const busy = await js(`const o=document.querySelector('.transition-overlay.active');return !!o;`);
    if (busy === false) { await settle(250); return true; }
    await settle(300);
  }
  return false;
};

// Where the app thinks it is, read off the screen itself. Trusting the label of
// the button that was tapped is how a sweep reports walking ten screens after
// visiting one.
const screenName = () => js(`
  const t = document.querySelector('.screen-title, .app-panel header h2, .door-title, h1, h2');
  const eyebrow = document.querySelector('.screen-eyebrow, .app-panel header span, .door-eyebrow');
  const bits = [eyebrow && eyebrow.innerText, t && t.innerText].filter(Boolean)
    .map(x => x.trim().replace(/\\s+/g,' '));
  return bits.join(' · ').slice(0, 60) || '(unnamed)';
`);
const text = async () => (await js('return document.body?document.body.innerText:""')) || '';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// Buttons that end the session, drop the venue, or wipe something. A sweep that
// taps these is a sweep that stops sweeping — or destroys the state it is
// meant to be walking through.
const DONT_TAP = /disconnect|stop hosting|forget|sign ?out|log ?out|switch|delete|clear|remove|leave|reset|cancel|stop camera/i;

/** Every visible control on screen that cannot actually be used: zero size, or
 *  invisible, or covered. This is bug 2, asked generically. */
const invisibleControls = () => js(`
  const bad = [];
  for (const el of document.querySelectorAll('button, a[href], input, select, video')) {
    const cs = getComputedStyle(el);
    // Deliberately hidden is fine — that is a component choosing not to render
    // something. What is not fine is a control the app believes it is showing.
    if (cs.display === 'none' || cs.visibility === 'hidden' || el.hidden) continue;
    if (el.offsetParent === null && cs.position !== 'fixed') continue;
    const r = el.getBoundingClientRect();
    const label = (el.innerText || el.getAttribute('aria-label') || el.placeholder || el.className || el.tagName).trim().replace(/\\s+/g, ' ').slice(0, 48);
    if (r.width < 2 || r.height < 2) { bad.push(label + ' [' + Math.round(r.width) + 'x' + Math.round(r.height) + ']'); continue; }
    if (Number(cs.opacity) === 0) { bad.push(label + ' [opacity 0]'); }
  }
  return JSON.stringify(bad);
`);

/** Bug 1, asked generically: is the app still mounted and showing something? */
const alive = () => js(`
  const root = document.getElementById('root');
  return JSON.stringify({ kids: root ? root.childElementCount : 0, len: (document.body.innerText||'').trim().length });
`);

// Labels are truncated to a fixed width so a button can be found again by the
// same text it was listed under. That width has to be generous: the menu tiles
// read "1 My Pass Pass, QR, event & venue access" and a tighter cut dropped
// every tile except History — leaving the sweep walking one screen and calling
// it the app.
const controls = () => js(`
  return JSON.stringify([...document.querySelectorAll('button')]
    .filter(b => !b.disabled && b.offsetParent)
    .map(b => (b.innerText||'').trim().replace(/\\s+/g,' ').slice(0, 90))
    .filter(t => t.length > 0));
`);
const tapExact = (label) => js(`
  const t = ${JSON.stringify(label)};
  const el = [...document.querySelectorAll('button')].find(b => (b.innerText||'').trim().replace(/\\s+/g,' ').slice(0, 90) === t && !b.disabled && b.offsetParent);
  if (!el) return false; el.click(); return true;
`);

// ── Get in. No venue, which is the state that crashed. ──────────────────────
await cdp('Page.navigate', { url: appUrl }); await settle(2500);
await js(`if(navigator.serviceWorker)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));localStorage.setItem('hvas_hub_off','1');return 1;`);
await cdp('Page.navigate', { url: appUrl }); await settle(11000);

console.log('SIGNED IN, NO VENUE');
await js(`const b=[...document.querySelectorAll('button')].find(x=>/member sign in/i.test(x.innerText||''));if(b)b.click();return 1;`);
await settle(1500);
await js(`
  const set=(ph,v)=>{const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(ph));if(!el)return;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set('First name','Sweep'); set('(850)','850-960-0002'); return 1;`);
await settle(500);
await js(`const b=[...document.querySelectorAll('button')].find(x=>/continue|send code/i.test(x.innerText||'')&&!x.disabled);if(b)b.click();return 1;`);
await settle(3000);
await js(`const b=[...document.querySelectorAll('button')].find(x=>/verify/i.test(x.innerText||'')&&!x.disabled);if(b)b.click();return 1;`);
await settle(3000);
const home = await alive();
ok(JSON.parse(home).kids > 0, 'the member app is mounted with no venue connected');
errors.length = 0;   // ignore anything from the boot/connect attempt itself

// Signing in does not land on the menu — a member drops straight onto My Pass,
// because a two-item menu is not worth showing. So the walk has to go to Home
// itself, or it enumerates the tabs of My Pass and calls that the whole app.
// (It did exactly that, and passed, which is the most dangerous way for a sweep
// to be wrong: it reported four green checks having walked one screen.)
const goHome = async () => {
  await cdp('Page.navigate', { url: appUrl }); await settle(4000);
  await js(`const b=[...document.querySelectorAll('button')].find(x=>/enter ·|member sign in/i.test(x.innerText||''));if(b)b.click();return 1;`);
  await settle(3500);
  for (let i = 0; i < 6; i++) {
    await waitIdle();
    if (/your night, your access/i.test(await text())) return true;
    await js(`const b=[...document.querySelectorAll('button')].find(x=>/^home$/i.test((x.innerText||'').trim()));if(b)b.click();return 1;`);
    await settle(600);
  }
  await waitIdle();
  return /your night, your access/i.test(await text());
};
ok(await goHome(), 'the member menu is reachable');

// ── Walk it. Every tile, then every tab inside it. ──────────────────────────
const seen = new Set();
const visited = [];
const problems = [];

const inspect = async (intended) => {
  const where = `${intended} [${await screenName()}]`;
  const a = JSON.parse(await alive());
  if (a.kids === 0 || a.len < 5) { problems.push(`${where}: the app rendered nothing (root kids ${a.kids}, ${a.len} chars)`); return false; }
  const bad = JSON.parse((await invisibleControls()) || '[]');
  if (bad.length) problems.push(`${where}: ${bad.length} control(s) shown but unusable — ${bad.join(', ')}`);
  visited.push(where);
  return true;
};

await inspect('Home');
const tiles = JSON.parse((await controls()) || '[]')
  .filter((t) => !DONT_TAP.test(t) && !/^home$/i.test(t));
console.log('   menu:', tiles.join(' | '));
// A sweep that walks nothing must fail, not pass quietly.
ok(tiles.length >= 3, `the menu has tiles to walk (${tiles.length})`);

for (const tile of tiles) {
  if (!(await goHome())) { problems.push(`could not get back to the menu before ${tile}`); break; }
  if (!(await tapExact(tile))) continue;
  await waitIdle();
  const label = tile.replace(/^\d+\s*/, '').split(' ').slice(0, 3).join(' ');
  if (/your night, your access/i.test(await text())) {
    problems.push(`the ${label} tile did not go anywhere — still on the menu after the transition`);
    continue;
  }
  if (!(await inspect(label))) continue;

  // Tabs within the screen, one level deep. This is where Solo vs CPU and
  // Record live — the modes that must work with no venue at all.
  // HOME is on every screen and walks straight back out of the one being
  // explored, so the sweep would leave each screen having seen only its way out.
  const tabs = JSON.parse((await controls()) || '[]')
    .filter((t) => !DONT_TAP.test(t) && !/^home$/i.test(t) && !seen.has(`${label}>${t}`));
  for (const tab of tabs.slice(0, 8)) {
    seen.add(`${label}>${tab}`);
    if (!(await tapExact(tab))) continue;
    await waitIdle(); await settle(1200);
    await inspect(`${label} → ${tab}`);
  }
}

console.log('\nEVERY SCREEN A MEMBER CAN REACH');
console.log('   walked:', visited.length, 'screens');
for (const v of visited) console.log('     ·', v);

console.log('\nNOTHING WHITE-SCREENED');
ok(!problems.some((p) => /rendered nothing/.test(p)), 'the app stayed mounted through every tap');

console.log('\nNOTHING SHOWN BUT UNUSABLE');
const invis = problems.filter((p) => /unusable/.test(p));
ok(invis.length === 0, invis.length ? `${invis.length} screen(s) render a control nobody can use` : 'every visible control has real size and is visible');
for (const p of invis) console.log('      ', p);

console.log('\nNO CRASHES ALONG THE WAY');
// A failed fetch to a venue that is not there is expected and is not a crash.
const real = errors.filter((e) => !/Failed to fetch|NetworkError|net::ERR|AbortError|load failed/i.test(e));
ok(real.length === 0, real.length ? `${real.length} uncaught error(s) during the walk` : 'no uncaught errors on any screen');
for (const e of [...new Set(real)].slice(0, 8)) console.log('      ', e);

for (const p of problems.filter((x) => /rendered nothing/.test(x))) console.log('      ', p);
console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); chrome.kill(); web.close();
process.exit(fail ? 1 : 0);
