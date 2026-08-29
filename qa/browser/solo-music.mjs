// Solo's music, and the answer solo used to give away.
//
// Two things the owner hit on a real phone that every existing suite passed
// straight through:
//
//   1. The song did not play. The player is built behind a network fetch of
//      YouTube's API, and the first square is called 350ms after Start — so the
//      effect that loads the song ran with no usable player, returned, and
//      never ran again, because the song never changed afterwards. The round
//      then held forever waiting for music nobody had asked for. It passed
//      every test because the fake player was instant and forgiving; real
//      YouTube is neither, and it drops loadVideoById before onReady in
//      silence. The fake models that now.
//
//   2. The calling panel printed the artist and the title. The song IS the
//      question — the whole game is hearing it and finding it on your card —
//      and printing it turned that into reading a label. The venue card has
//      never done this.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.HVAS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP = new URL('../../hitmans_vip_membership_app/dist', import.meta.url).pathname;
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const web = createServer(async (q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/, '') || '/';
  if (p === '/' || !extname(p)) p = '/index.html';
  try { const b = await readFile(join(APP, normalize(p))); s.writeHead(200, { 'Content-Type': T[extname(p)] || 'application/octet-stream' }); s.end(b); }
  catch { s.writeHead(404).end('no'); }
});
await new Promise((r) => web.listen(0, r));
const appUrl = `http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT = 9433;
const chrome = spawn(CHROME, ['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=/tmp/cdp-music-${Date.now()}`, '--window-size=932,430',
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
const js = async (e) => {
  const r = await Promise.race([
    cdp('Runtime.evaluate', { expression: `(()=>{${e}})()`, returnByValue: true, awaitPromise: true }),
    new Promise((res) => setTimeout(() => res({ T: 1 }), 15000)),
  ]);
  return r.T ? '<<TIMEOUT>>' : r.result?.result?.value;
};
const jsA = async (e) => (await cdp('Runtime.evaluate', { expression: `(async()=>{${e}})()`, returnByValue: true, awaitPromise: true })).result?.result?.value;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const text = async () => (await js('return document.body?document.body.innerText:""')) || '';
const tap = (n) => js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const tapAny = (n) => js(`const t=${JSON.stringify(n)}.toLowerCase();const hit=s=>[...document.querySelectorAll(s)].find(b=>(b.innerText||'').toLowerCase().includes(t)&&b.offsetParent&&(b.innerText||'').length<220);const el=hit('button')||hit('a,[role="button"]')||hit('li,article,div');if(!el)return false;el.click();return true;`);
const fill = (ph, v) => js(`const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const rotate = (w2, h2) => cdp('Emulation.setDeviceMetricsOverride', { width: w2, height: h2, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: w2 > h2 ? 90 : 0, type: w2 > h2 ? 'landscapePrimary' : 'portraitPrimary' } });
const dropSW = () => jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return true;`);
const FAKE_YT = await readFile(new URL('./fake-youtube.js', import.meta.url), 'utf8');
const fakeYouTube = (cfg) => cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__FAKE_YT=${JSON.stringify(cfg || {})};\n${FAKE_YT}` });
const waitFor = async (expr, ms = 40000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if ((await js(`return !!(${expr});`)) === true) return true;
    await settle(400);
  }
  return false;
};
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

// A player that takes THREE SECONDS to become usable — a phone on venue wifi,
// not a test box. The first square is called 350ms in, so this is the exact
// window the bug lived in.
await fakeYouTube({ duration: 34, readyDelay: 3000 });

await cdp('Page.navigate', { url: appUrl }); await settle(2200); await dropSW();
await js(`localStorage.setItem('hvas_hub_off','1');return 1;`);
await cdp('Page.navigate', { url: appUrl }); await settle(3000);
await tapAny('Member Sign In'); await settle(1400);
await fill('First name', 'Ear'); await fill('(850)', '850-960-0021'); await settle(400);
await tap('Continue'); await settle(2500);
let reached = false;
for (let i = 0; i < 20 && !reached; i++) {
  await js(`const b=document.querySelector('[data-target="lobby"]');if(b)b.click();return 1;`);
  await settle(1300);
  reached = await js("return !!document.querySelector('.play-steps')");
}
ok(reached, 'Lip Sync Bingo opens');

await rotate(932, 430); await settle(900);
let started = false;
for (let i = 0; i < 14 && !started; i++) { started = await tap('Start Solo Round'); await settle(600); }
ok(started, 'a round starts');
await settle(2500);

console.log('\nA SLOW PLAYER STILL PLAYS THE FIRST SONG');
// The app must WAIT rather than shout into a player that cannot hear it. A
// dropped load is not harmless: it is the load that never happens again.
ok((await js(`return (window.__FAKE_YT_STATE||{}).droppedBeforeReady || 0;`)) === 0,
   'nothing is loaded into a player that is not ready yet');
ok(await waitFor(`window.__FAKE_YT_STATE && window.__FAKE_YT_STATE.ready`, 15000), 'the player becomes ready');
// This is the fix. Before it, nothing re-ran the load once the player woke up,
// and the round held on "Cueing the song" for the rest of its life.
ok(await waitFor(`window.__FAKE_YT_STATE && window.__FAKE_YT_STATE.loads > 0`, 25000),
   'and the song is loaded once it is — the round is not left holding forever');
ok(await waitFor(`window.__FAKE_YT_STATE && window.__FAKE_YT_STATE.playing`, 25000), 'and it actually plays');

console.log('\nTHE PLAYER IS REAL ENOUGH FOR A PHONE TO PLAY IT');
const frame = await js(`
  const f = document.querySelector('.playalong-frame--real');
  if (!f) return 'MISSING';
  const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
  const onScreen = r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
  const host = f.parentElement, hs = getComputedStyle(host), hr = host.getBoundingClientRect();
  return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height), op: cs.opacity, vis: cs.visibility, disp: cs.display, onScreen,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)],
    vp: [innerWidth, innerHeight],
    hostPos: hs.position, hostRect: [Math.round(hr.left), Math.round(hr.top), Math.round(hr.right), Math.round(hr.bottom)] });
`);
console.log('   [frame]', frame);
const fr = frame === 'MISSING' ? null : JSON.parse(frame);
ok(!!fr, 'the player element exists');
// Every one of these is something a browser measures before deciding whether it
// will autoplay. The old frame was 2x2 at opacity .01 and failed all of them.
ok(!!fr && fr.w >= 100 && fr.h >= 60, `it has real size (${fr?.w}x${fr?.h}, not 2x2)`);
ok(!!fr && Number(fr.op) === 1, `it is not transparent (opacity ${fr?.op})`);
ok(!!fr && fr.vis === 'visible' && fr.disp !== 'none', 'it is not hidden');
ok(!!fr && fr.onScreen, 'and it is actually within the viewport');
// ...and yet the title cannot be read, because something opaque is over it.
const shield = await js(`
  const s = document.querySelector('.playalong-shield');
  if (!s) return 'MISSING';
  const r = s.getBoundingClientRect(), f = document.querySelector('.playalong-frame--real').getBoundingClientRect();
  const cs = getComputedStyle(s);
  const covers = r.left <= f.left && r.top <= f.top && r.right >= f.right && r.bottom >= f.bottom;
  const opaque = !/rgba\\(.*,\\s*0(\\.\\d+)?\\)$/.test(cs.backgroundColor) && cs.backgroundColor !== 'transparent';
  return JSON.stringify({ covers, opaque, bg: cs.backgroundColor });
`);
console.log('   [shield]', shield);
const sh = shield === 'MISSING' ? null : JSON.parse(shield);
ok(!!sh && sh.covers, 'an opaque shield covers it completely');
ok(!!sh && sh.opaque, `so the video's own title cannot be read (${sh?.bg})`);

console.log('\nTHE SONG IS THE QUESTION — IT IS NOT PRINTED');
// The card's own squares list every artist and song in the deck; that is the
// board. What must not appear is the CALLING panel naming the one now playing.
const hud = await js(`
  const el = document.querySelector('.hud-strip-now');
  return el ? el.textContent.replace(/\\s+/g,' ').trim() : 'MISSING';
`);
console.log('   [now playing]', hud);
ok(hud !== 'MISSING', 'the calling strip is there');
ok(/by ear/i.test(hud || ''), 'and it says to name it by ear');
// The decisive one: whatever is playing must not be named in that panel.
const leaked = await js(`
  const el = document.querySelector('.hud-strip-now');
  if (!el) return 'NOPANEL';
  const hud = el.textContent.toLowerCase();
  // Every artist and song on the card — one of them is the answer.
  const names = [...document.querySelectorAll('.k-tile-artist, .k-tile-song')]
    .map(e => e.textContent.trim().toLowerCase()).filter(t => t.length > 3);
  return JSON.stringify(names.filter(n => hud.includes(n)));
`);
const hits = leaked === 'NOPANEL' ? null : JSON.parse(leaked);
ok(Array.isArray(hits) && hits.length === 0,
   `no artist or title from the card appears in it${hits && hits.length ? ' — leaked: ' + hits.join(', ') : ''}`);

console.log('\nBUT WITH NO SOUND IT TELLS YOU, RATHER THAN DEAD-ENDING');
// Kill the music mid-round. A hidden title with nothing to hear is not a
// harder game, it is an unplayable one.
await js(`window.__FAKE_YT = Object.assign({}, window.__FAKE_YT, { autoplay: false, failAfter: 1 }); return 1;`);
// The "no sound" marker is an icon now rather than a line of copy — the strip
// exists so the play screen stops being something to read — but it still has to
// be THERE, or a named song reads as the game giving the answer away.
const told = await waitFor(`!!document.querySelector('.hud-strip-mute')`, 90000);
ok(told, 'when the music fails the strip marks it');
// Asked of the panel itself, not of the card. Cross-referencing the squares
// looked rigorous and was wrong: the square being called gets COVERED, which
// takes its artist out of the DOM, so the check reported a leak-free panel that
// was in fact naming the song perfectly well.
const named = await js(`
  const el = document.querySelector('.hud-strip-now');
  if (!el) return 'NOPANEL';
  const v = el.querySelector('b');
  return JSON.stringify({ hud: el.textContent.replace(/\\s+/g,' ').trim(), value: v ? v.textContent.trim() : '' });
`);
console.log('   [failed panel]', named);
const nm = (()=>{ try { return JSON.parse(named); } catch { return null; } })();
ok(!!nm && nm.value.length > 1 && !/by ear/i.test(nm.value),
   `and names the song, so the round is still playable — "${nm ? nm.value : '?'}"`);

console.log(`\n${pass} passed, ${fail} failed`);
ws.close(); chrome.kill(); web.close();
process.exit(fail ? 1 : 0);
