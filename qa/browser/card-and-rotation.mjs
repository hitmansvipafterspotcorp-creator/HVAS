import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
process.env.HVAS_HOST_CODE='HOST850'; process.env.BINGO_PODIUM_SECONDS='600';
const {createApp}=await import('/home/claude/hvas/server/src/app.mjs');
const {server}=createApp({dataDir:`/tmp/hvas-ord-${Date.now()}`});
await new Promise(r=>server.listen(0,r));
const api=`http://127.0.0.1:${server.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(api+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const host=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const rico=await mk('850-905-0001','Rico');
await call('POST','/bingo/join',{},rico.token); await call('POST','/bingo/ready',{ready:true},rico.token);
const nova=await mk('850-905-0002','Nova');
await call('POST','/bingo/join',{},nova.token); await call('POST','/bingo/ready',{ready:true},nova.token);
await call('POST','/bingo/start',{},host);

const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9350',`--user-data-dir=/tmp/cdp-ord-${Date.now()}`,'--window-size=430,932','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60;i++){try{const l=await(await fetch('http://127.0.0.1:9350/json/list')).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl){wsUrl=p.webSocketDebuggerUrl;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const js=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const jsA=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const text=async()=>(await js('return document.body?document.body.innerText:""'))||'';
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const tapAny=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const hit=s=>[...document.querySelectorAll(s)].find(b=>(b.innerText||'').toLowerCase().includes(t)&&b.offsetParent&&(b.innerText||'').length<220);const el=hit('button')||hit('a,[role="button"]')||hit('li,article,div');if(!el)return false;el.click();return true;`);
const fill=(ph,v)=>js(`const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const openTile=t=>js(`const b=document.querySelector('[data-target="${t}"]');if(!b)return false;b.click();return true;`);
const dropSW=()=>jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return true;`);
const shot=async n=>{const r=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  if(r.result?.data){const {writeFile}=await import('node:fs/promises');
  await writeFile('/tmp/claude-0/-home-claude/dc5ff8a7-0f05-5b76-beee-3a13d5c10116/scratchpad/shots/rot-'+n+'.png',Buffer.from(r.result.data,'base64'));console.log('  📸',n);}};
const gridOrder=()=>js(`return [...document.querySelectorAll('.k-tile')].map(b=>b.dataset.item||'FREE').join(',')`);
const rotate=(w,h)=>cdp('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:2,mobile:true,screenOrientation:{type:w>h?'landscapePrimary':'portraitPrimary',angle:w>h?90:0}});

await cdp('Page.navigate',{url:appUrl}); await settle(2000); await dropSW();
await js(`localStorage.setItem('hvas_api_base',${JSON.stringify(api)});localStorage.setItem('hvas_hub_off','1');localStorage.removeItem('hvas_hub');return 1;`);
await cdp('Page.navigate',{url:appUrl}); await settle(1500); await dropSW();
await cdp('Page.navigate',{url:appUrl}); await settle(2500);
await tapAny('Member Sign In'); await settle(1500);
await fill('First name','Rico'); await fill('(850)','850-905-0001'); await settle(400);
await tap('Send code'); await settle(1600);
const dev=(await call('POST','/auth/member/start',{contact:'850-905-0001'})).body.devCode;
await fill('000000',String(dev)); await settle(300);
await tap('Verify')||await tap('Continue'); await settle(2500);
for(let i=0;i<20;i++){await openTile('lobby');await settle(1300);if(/go to my card|mark ready|✓ ready/i.test(await text()))break;}
for(let i=0;i<12;i++){await tap('Go to My Card');await settle(1400);if(/now playing|listen/i.test(await text()))break;}

let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

// This section used to be called SIDEWAYS PLAY ONLY and asserted that a phone
// held upright refused to draw the card. That rule is gone: a 5x5 card is
// square, and a phone held upright has more width to give a square than a phone
// on its side has height, so demanding a rotation made the card smaller and
// cost every player a step to get there. Both orientations play now — and the
// upright one, being the way a phone is actually held, is the one that has to
// be good rather than merely allowed.
console.log('IT PLAYS BOTH WAYS UP');
await rotate(430,932);                     // upright — the normal way
await settle(1800);
let t = await text();
ok(!/turn your phone sideways/i.test(t), 'held upright, nothing demands a rotation');
ok(/your card|standing by|to bingo|claim bingo/i.test(t), 'the card screen is really there');
const upCells = (await gridOrder()).split(',').filter(Boolean).length;
ok(upCells === 25, `the full 5x5 card renders upright (${upCells} squares)`);
const upFit = await js(`
  const g=document.querySelector('.k-grid'); if(!g) return 'none';
  const r=g.getBoundingClientRect();
  return JSON.stringify({w:Math.round(r.width),vpW:window.innerWidth,whole:r.top>=-1&&r.bottom<=window.innerHeight+1});`);
console.log('   [upright card]', upFit);
const uf = (()=>{try{return JSON.parse(upFit);}catch{return null;}})();
ok(!!uf && uf.w >= uf.vpW * 0.85, `and takes the width of the phone (${uf?uf.w:'?'} of ${uf?uf.vpW:'?'})`);
ok(!!uf && uf.whole, 'with no row hidden below the fold');
await shot('portrait');

await rotate(932,430);                     // turned — still fine
await settle(1800);
t = await text();
ok(/your card|standing by|to bingo|claim bingo/i.test(t), 'turned sideways it still plays');
console.log('   [landscape reads]', t.replace(/\n/g,' / ').slice(0, 110));
const cells = (await gridOrder()).split(',').filter(Boolean).length;
ok(cells === 25, `the full 5x5 card renders in landscape too (${cells} squares)`);
await shot('landscape');

await rotate(430,932);                     // and back, without breaking
await settle(1600);
ok((await gridOrder()).split(',').filter(Boolean).length === 25,
   'and turning back upright keeps a whole card rather than half-rendering');

console.log('\nPLAY ALONG FROM ANYWHERE');
await settle(1600);
const t2 = await text();
ok(/hear the song here|playing from somewhere else/i.test(t2), 'the card offers to play the song on your own phone');
await tap('Hear the song here'); await settle(2000);
const sealed = await js(`
  const f = document.querySelector('.playalong-frame');
  if (!f) return 'no frame';
  const cs = getComputedStyle(f); const r = f.getBoundingClientRect();
  return { opacity: Number(cs.opacity), w: Math.round(r.width), h: Math.round(r.height), events: cs.pointerEvents };`);
ok(sealed && sealed !== 'no frame', 'switching it on mounts a player');
if (sealed && sealed !== 'no frame') {
  ok(sealed.opacity <= 0.05 && sealed.w <= 4 && sealed.h <= 4,
     `the video frame is sealed so its title cannot be read (${sealed.w}x${sealed.h}px, opacity ${sealed.opacity})`);
  ok(sealed.events === 'none', 'and cannot be tapped open to reveal it');
}
const face = await text();
ok(/in your ear|waiting for the next song/i.test(face), 'it says plainly that it is playing');
ok(/find it on your card/i.test(face), 'and reminds you the point is still to work it out by ear');

console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();server.close();web.close();
process.exit(fail?1:0);
