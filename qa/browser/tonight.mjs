// The owner's front door, driven as a real night.
//
// What this is really testing is a claim about attention, not about routing:
// that whoever is running the place can open the app and be told the one thing
// to do, instead of holding a map of every screen in their head and going to
// fetch it. The old path to host controls went in as a MEMBER, through the game
// menu — four taps through the wrong role to reach your own console.
//
// So the assertions are about what is LARGEST on the screen at each moment of a
// night, and about how many taps it takes to act on it.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE = 'HOST850'; process.env.HVAS_STAFF_CODE = 'DOOR850';
process.env.BINGO_SONG_SECONDS = '3';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { server: api } = createApp({ dataDir: `/tmp/hvas-tonight-${Date.now()}` });
await new Promise((r) => api.listen(0, r));
const API = `http://127.0.0.1:${api.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const venue = (await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const hire = async (name, role, by) => {
  const inv = await call('POST','/staff/invite',{ name, role }, by);
  return (await call('POST','/auth/staff/claim',{ code: inv.body.code })).body.token;
};
const owner = await hire('Kenya','host', venue);
const mk = async (ph, nm) => { const s = await call('POST','/auth/member/start',{contact:ph});
  return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body; };

const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT=9476;
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-tonight-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60&&!wsUrl;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)wsUrl=p.webSocketDebuggerUrl;}catch{}if(!wsUrl)await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const w=new Map();const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown'){const d=String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'');
    if(!/ServiceWorker/i.test(d))errors.push(d.split('\n')[0].slice(0,140));}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await cdp('Runtime.enable');await cdp('Page.enable');
const js=async e=>(await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const jsA=async e=>(await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const shot=async n=>{if(!SHOT)return;const r=await cdp('Page.captureScreenshot',{format:'png'});if(r.result?.data)await writeFile(join(SHOT,n),Buffer.from(r.result.data,'base64'));};
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const type=(sel,v)=>js(`const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;
  const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(v)});
  el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
// What the screen is SHOUTING — the headline in the one big card.
const now=()=>js(`const el=document.querySelector('.tonight-headline');return el?el.innerText.trim():''`);
const nowKind=()=>js(`const el=document.querySelector('.tonight-now');return el?[...el.classList].find(c=>c.startsWith('u-'))||'':''`);
const rows=()=>js(`return [...document.querySelectorAll('.tonight-row strong')].map(e=>e.innerText.trim()).join(' | ')`);
const openTab=()=>js(`const el=document.querySelector('.staff-hub-tab.on');return el?el.innerText.trim():''`);
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};

await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
await js(`localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(7000);
// The owner comes in the door, as themselves.
await js(`const b=document.querySelector('.door-fine');for(let i=0;i<5;i++)b.click();return 1;`);
await settle(1500);
await tap('Staff Check-In');await settle(1500);
await type('.auth-card input','HOST850');await settle(300);
await tap('Unlock');await settle(4500);

console.log('A QUIET VENUE TELLS YOU THE TRUTH, NOT "NOTHING TO DO"');
ok(/tonight/i.test(await openTab()),'the app opens on Tonight, not on a menu');
console.log('   [now]', await now(), '|', await nowKind());
ok(/nobody inside yet/i.test(await now()),'and says what the room actually is');
ok(await nowKind()==='u-door','styled as the quiet state');
ok((await rows())==='' ,'with nothing else pretending to need them');
await shot('tonight-1-quiet.png');

console.log('\nTWO IN THE LOBBY AND IT CHANGES ON ITS OWN');
const nova=await mk('850-910-0001','Nova'); const rio=await mk('850-910-0002','Rio');
await call('POST','/bingo/join',{},nova.token);
await call('POST','/bingo/join',{},rio.token);
// Nobody navigated. The screen is polling, so the night moves the screen.
await settle(5500);
console.log('   [now]', await now(), '|', await nowKind());
ok(/waiting in the lobby/i.test(await now()),'the lobby takes over the big card without a tap');
ok(await nowKind()==='u-ready','and changes colour with it');
await shot('tonight-2-lobby.png');

console.log('\nTWO TAPS TO RUN THE NIGHT — NOT FOUR THROUGH THE MEMBER APP');
ok(await tap('Start the round'),'the big card is the button');
await settle(3000);
console.log('   [tab]', await openTab());
ok(/host|run/i.test(await js(`return (document.body.innerText||'').slice(0,400)`)) ,'it lands in host controls');
ok(await js(`return [...document.querySelectorAll('.staff-hub-tab')].some(b=>/tonight/i.test(b.innerText))`),
   'and the way back is the same tab row you came through');
await shot('tonight-3-host.png');

console.log('\nA CLAIM PULLS THE WHOLE SCREEN TO IT');
await call('POST','/bingo/start',{},owner);
await call('POST','/bingo/autofill',{on:true},nova.token);
let won=false;
for(let i=0;i<60&&!won;i++){ await call('POST','/bingo/call',{},owner);
  won=(await call('POST','/bingo/claim',{},nova.token)).status===200; }
ok(won,'Nova wins a round the server believes in');
// Back to Tonight the way the owner would: tap the tab.
await js(`const b=[...document.querySelectorAll('.staff-hub-tab')].find(b=>/tonight/i.test(b.innerText));if(b)b.click();return !!b;`);
await settle(5500);
console.log('   [now]', await now(), '|', await nowKind());
ok(/called BINGO/i.test(await now()),'the person standing there is the whole screen');
ok(await nowKind()==='u-claims','and it is styled as the urgent one');
ok(/waiting \d+/i.test(await js(`const e=document.querySelector('.tonight-eyebrow');return e?e.innerText:''`)),
   'with how long they have been standing there');
console.log('   [then]', await rows());
ok(/is live/i.test(await rows()),'the running round drops to a small row under it');
await shot('tonight-4-claim.png');

console.log('\nAND IT LANDS ON THE CLAIMS TAB, NOT THE TOP OF THE CONSOLE');
ok(await tap('Check the card'),'one tap from the claim');
await settle(3000);
const onClaims=await js(`const el=document.querySelector('.staff-hub-tab.on, .host-tabs .staff-hub-tab.on');
  return [...document.querySelectorAll('.host-tabs .staff-hub-tab')].find(b=>b.className.includes('on'))?.innerText||''`);
console.log('   [host tab]', onClaims);
ok(/claim/i.test(onClaims),'arriving on Claims — not Run, which would be the same fetch quest');
ok(/Nova/.test(await js(`return document.body.innerText||''`)),'with Nova on screen to approve');
await shot('tonight-5-claims.png');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail?1:0);
