// The app keeps itself up to date, on its own, without anybody being told to.
//
// This is the suite for the thing nobody could test by looking: members install
// this to a home screen, and a home-screen app is not a tab somebody refreshes.
// The phone RESUMES the window when the icon is tapped, so the running
// JavaScript can be days old while the phone is online the whole time — which
// is exactly what happened: a build shipped, verified, live, and the owner's
// own phone kept showing the previous day's app.
//
// So: serve build A, let the app boot, publish build B, and assert the app
// notices and reloads itself. Then assert the half that keeps it from being
// obnoxious — that it will NOT do that while a performance is being recorded,
// because a take cannot be redone.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = '/home/claude/hvas/hitmans_vip_membership_app/dist';
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };

// What the server currently claims is published. Flipping this is a deploy.
let published = JSON.parse(await readFile(join(APP, 'version.json'), 'utf8')).build;
let versionHits = 0;

const web = createServer(async (q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/, '') || '/';
  if (p === '/version.json') {
    versionHits += 1;
    s.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    s.end(JSON.stringify({ build: published }));
    return;
  }
  if (p === '/' || !extname(p)) p = '/index.html';
  try { const b = await readFile(join(APP, normalize(p))); s.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); s.end(b); }
  catch { s.writeHead(404).end('no'); }
});
await new Promise((r) => web.listen(0, r));
const appUrl = `http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT = 9422;
const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cdp-upd-${Date.now()}`, '--window-size=414,896',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); const p = l.find((t) => t.type === 'page'); if (p?.webSocketDebuggerUrl) wsUrl = p.webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await new Promise((r) => setTimeout(r, 300));
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const w = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && w.has(m.id)) { w.get(m.id)(m); w.delete(m.id); } });
const cdp = (m, p = {}) => new Promise((res) => { const i = ++id; w.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
await cdp('Runtime.enable'); await cdp('Page.enable');
const js = async (e) => (await cdp('Runtime.evaluate', { expression: `(()=>{${e}})()`, returnByValue: true, awaitPromise: true })).result?.result?.value;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
// The app boots behind a several-second transition. Every wait here is for a
// condition, not a duration — a fixed sleep either wastes time or, worse,
// reports the app as broken when it was merely still starting.
const waitFor = async (expr, ms = 25000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await js(`return !!(${expr});`)) === true) return true;
    await settle(300);
  }
  return false;
};
const waitBooted = () => waitFor(`document.getElementById('root') && document.getElementById('root').childElementCount > 0 && window.__hvasHoldUpdates`);

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('AN INSTALLED APP THAT KEEPS ITSELF CURRENT');

await cdp('Page.navigate', { url: appUrl }); await settle(2000);
await js(`localStorage.clear();return 1;`);
await cdp('Page.navigate', { url: appUrl });
ok(await waitBooted(), 'the app boots');

// A marker on the window. It cannot survive a real page load, so if it is gone
// later, the app genuinely reloaded rather than merely re-rendering.
await js(`window.__before = 'stamp-' + Date.now(); return 1;`);
const before = await js(`return window.__before;`);
ok(!!before, 'the app is running and marked');

const built = await js(`return document.body.innerText.match(/App build [^ ·]+/) ? 1 : 0;`);
ok(versionHits > 0, `the app checked what is published on its own (${versionHits} check${versionHits === 1 ? '' : 's'})`);

// ── A deploy lands. ────────────────────────────────────────────────────────
published = 'a-brand-new-build';
console.log('  … a new build is published');

// Nudge the seams the app watches: coming back to the foreground is the one a
// phone actually produces when somebody taps the icon.
await js(`window.dispatchEvent(new Event('focus'));return 1;`);

// The marker cannot survive a real page load, so its disappearance IS the
// reload — nothing else in the app clears it.
ok(await waitFor(`!window.__before`, 20000), 'the app reloaded itself onto the new build — no tap, no prompt');
ok(await waitBooted(), 'and came back up mounted, not a white screen');

// ── The other half: it must not do that at a ruinous moment. ───────────────
console.log('  … and now with a take being recorded');
await js(`window.__before2 = 'stamp2'; return 1;`);
// Take a hold the way a recording screen does, then publish again.
const held = await js(`
  if (!window.__hvasHoldUpdates) return 'NO-HOOK';
  window.__release = window.__hvasHoldUpdates();
  return 'held';
`);
ok(held === 'held', 'a screen can hold updates off');
published = 'another-newer-build';
await js(`window.dispatchEvent(new Event('focus'));return 1;`);
// Long enough that a reload would certainly have happened by now — this is the
// one assertion that has to be a duration, because it is proving an absence.
await settle(9000);
ok((await js(`return window.__before2 || null;`)) === 'stamp2', 'the app did NOT reload while the take was being held');
const pill = await js(`const b=document.querySelector('.update-pill');return b?(b.innerText||'').trim():'';`);
ok(/new version/i.test(pill || ''), `instead it offered it — "${pill}"`);

// Releasing the hold is the moment it becomes safe.
await js(`if(window.__release)window.__release();return 1;`);
ok(await waitFor(`!window.__before2`, 20000), 'and it took the update the instant the take was finished');
ok(await waitBooted(), 'coming back up mounted again');

// ── The failure that would take the app down, not just leave it stale. ─────
//
// version.json and index.html are two objects behind a CDN and GitHub Pages
// holds HTML for ten minutes, so "build X is published" can be true while the
// page being served is still the old one. Without a guard that is an infinite
// reload loop on every member's phone at once — the app simply gone until a
// cache somewhere turns over. This asserts it gives up and asks instead.
console.log('  … and when the published version can never actually be reached');
await js(`try{sessionStorage.clear();}catch(e){}return 1;`);
published = 'a-build-that-is-never-served';
await js(`window.dispatchEvent(new Event('focus'));return 1;`);
await settle(4000);
await waitBooted();

// Count reloads by marking the window and seeing how often the mark vanishes.
let reloads = 0;
const deadline = Date.now() + 40000;
await js(`window.__loopMark = 1; return 1;`);
while (Date.now() < deadline) {
  await settle(1500);
  if ((await js(`return !window.__loopMark;`)) === true) {
    reloads += 1;
    await waitBooted();
    await js(`window.__loopMark = 1; return 1;`);
    await js(`window.dispatchEvent(new Event('focus'));return 1;`);
  }
}
console.log(`   reloads while chasing an unreachable build: ${reloads}`);
ok(reloads <= 2, `it stops chasing instead of looping forever (${reloads} reload${reloads === 1 ? '' : 's'})`);
const giveUp = await js(`const b=document.querySelector('.update-pill');return b?(b.innerText||'').trim():'';`);
ok(/new version/i.test(giveUp || ''), 'and offers the update by hand instead');

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); chrome.kill(); web.close();
process.exit(fail ? 1 : 0);
