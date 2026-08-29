// The claim being tested: a member who joined once never needs a link again.
// Move the venue to a completely different address, publish that, and the app
// must find its way back on its own — no QR, no typing, no asking staff.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const REPO = new URL('../../', import.meta.url).pathname;
const CHROME = process.env.HVAS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP=new URL('../../hitmans_vip_membership_app/dist', import.meta.url).pathname;
const DIR=join(APP,'venues.json');
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream','Cache-Control':'no-store'});s.end(b);}
  catch{try{const b=await readFile(join(REPO, normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;

process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import(new URL('../../server/src/app.mjs', import.meta.url).href);
// ONE venue database, served on two different addresses in turn — exactly what
// a tunnel restart does to a room.
const dataDir=`/tmp/hvas-rooms-${Date.now()}`;
const v1 = createApp({ dataDir });
await new Promise(r=>v1.server.listen(0,r));
const addr1=`http://127.0.0.1:${v1.server.address().port}`;
const venueId=(await (await fetch(addr1+'/beacon')).json()).venueId;

let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};
console.log('THE VENUE HAS A NAME OF ITS OWN');
ok(/^v[0-9a-f]{12}$/.test(venueId), `the venue generated a permanent id (${venueId})`);

const publish=async(url)=>writeFile(DIR, JSON.stringify({updatedAt:Date.now(),venues:[{venueId,name:'HITMANS VIP After Spot',url,city:'Tallahassee',updatedAt:Date.now()}]},null,2));
await publish(addr1);

const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--remote-debugging-port=9370',
  `--user-data-dir=/tmp/cdp-rooms-${Date.now()}`,'--window-size=932,430','--disable-background-timer-throttling',
  '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60;i++){try{const l=await(await fetch('http://127.0.0.1:9370/json/list')).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl){wsUrl=p.webSocketDebuggerUrl;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const js=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const jsA=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const text=async()=>(await js('return document.body?document.body.innerText:""'))||'';
const dropSW=()=>jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return true;`);

await cdp('Page.navigate',{url:appUrl}); await settle(2200); await dropSW();
await js(`localStorage.setItem('hvas_hub_off','1');localStorage.removeItem('hvas_hub');return 1;`);

console.log('\nJOINING BY ROOM, NOT BY LINK');
const joined = await jsA(`
  const m = await import('${appUrl}assets/' + [...document.querySelectorAll('script[src]')].map(s=>s.src.split('/').pop())[0]);
  return 'loaded';`).catch(()=>null);
// Drive it through the app's own stored state instead of module internals.
await cdp('Page.navigate',{url:`${appUrl}?connect=${encodeURIComponent(addr1)}`}); await settle(4000);
const savedId = await js(`return localStorage.getItem('hvas_venue_id')`);
const savedBase = await js(`return localStorage.getItem('hvas_api_base')`);
ok(savedId===venueId, 'joining stores the venue id, not just the address');
ok(savedBase===addr1, 'and the address it was reachable at');

console.log('\nTHE VENUE MOVES');
v1.server.close();                                   // tunnel restarted: old address dead
const v2 = createApp({ dataDir });                   // same venue, new address
await new Promise(r=>v2.server.listen(0,r));
const addr2=`http://127.0.0.1:${v2.server.address().port}`;
ok(addr2!==addr1, `the room is now at a completely different address (${addr1.split(':').pop()} → ${addr2.split(':').pop()})`);
const sameVenue=(await (await fetch(addr2+'/beacon')).json()).venueId;
ok(sameVenue===venueId, 'but it is still the same venue, by id');
await publish(addr2);                                // the directory is updated

console.log('\nTHE MEMBER DOES NOTHING');
await cdp('Page.navigate',{url:appUrl}); await settle(9000);
const healedBase = await js(`return localStorage.getItem('hvas_api_base')`);
ok(healedBase===addr2, `the app found the room again on its own (${healedBase===addr2?'reconnected':healedBase})`);
const t=await text();
ok(!/can.t reach|connection failed/i.test(t), 'and never showed a failure screen');
const stillId = await js(`return localStorage.getItem('hvas_venue_id')`);
ok(stillId===venueId, 'still the same room it always was');

console.log('\nAND THE ROOM IS FINDABLE COLD');
// Forget the venue the way a new phone would — but not the "do not be the hub"
// flag, or the app takes over as the venue itself and never offers to connect.
await js(`for (const k of ['hvas_api_base','hvas_cfg','hvas_api_token','hvas_api_member_id','hvas_venue_id']) localStorage.removeItem(k);
          localStorage.setItem('hvas_hub_off','1'); localStorage.removeItem('hvas_hub'); return 1;`);
await cdp('Page.navigate',{url:appUrl}); await settle(3500);
await js(`const b=[...document.querySelectorAll('button')].find(x=>/connect to venue/i.test(x.innerText||''));if(b)b.click();return !!b;`);
await settle(2500);
const list=await text();
ok(/rooms playing now/i.test(list), 'a brand new phone is offered the rooms directory');
let row = null;
for (let k=0;k<15 && !row;k++){
  row = await js(`const r=document.querySelector('.room-row');return r?(r.innerText||'').split('\\n').join(' · '):null;`);
  if (!row) await settle(500);
}
ok(row && /hitmans vip after spot/i.test(row), `and sees the room listed by name (${row})`);
ok(row && /tallahassee/i.test(row), 'with where it is');
const clicked = await js(`const r=document.querySelector('.room-row');if(!r)return false;r.click();return true;`);
await settle(4000);
ok(clicked && (await js(`return localStorage.getItem('hvas_api_base')`)) === addr2,
   'and joins the room with one tap — no address typed anywhere');

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){console.log('\n--- screen ---\n'+(await text()).slice(0,700));}
ws.close();chrome.kill();v2.server.close();web.close();
process.exit(fail?1:0);
