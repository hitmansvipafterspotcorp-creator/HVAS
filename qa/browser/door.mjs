// The door: how a member gets into a room, and the camera they use to do it.
//
// Two things this exists to hold down, both found by using the app rather than
// by any test:
//
//   1. "Scan venue QR" opened a camera nobody could see. The video was mounted
//      in a frame whose size came from an image this scanner never rendered, so
//      the box collapsed to zero height, and the video inside it was styled
//      opacity:0 until a `.live` class nothing added. The stream was genuinely
//      open the whole time. You cannot aim a phone at a QR you cannot see.
//
//   2. The address box sat under the room list on every visit, asking to be
//      typed into, on a door where tapping the room already works. It is now
//      the fallback for the one case that needs it — an empty directory.
//
// Both are render-level. A build is clean either way and no server test goes
// near them, which is exactly why they shipped.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const CHROME='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}
  catch{try{const b=await readFile(join('/home/claude/hvas',normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9391;
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-door-${Date.now()}`,'--window-size=430,932',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60&&!wsUrl;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)wsUrl=p.webSocketDebuggerUrl;}catch{}if(!wsUrl)await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}
  if(m.method==='Runtime.exceptionThrown')console.log('  [PAGE ERROR]',m.params.exceptionDetails.exception?.description?.slice(0,300));});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await cdp('Runtime.enable'); await cdp('Page.enable');
const js=async e=>{const r=await Promise.race([cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true}),new Promise(res=>setTimeout(()=>res({T:1}),15000))]);return r.T?'<<TIMEOUT>>':(r.result?.exceptionDetails?('EXC '+r.result.exceptionDetails.text):r.result?.result?.value);};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const panelText=()=>js(`const el=document.querySelector('.venue-connect-form');return el?el.innerText.replace(/\\n/g,' / '):'none'`);
const addrBoxes=()=>js(`return document.querySelectorAll('.venue-connect-form input[type="url"]').length`);
let pass=0,fail=0;const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

// The directory is a static file on the published site, which this harness does
// not serve. Stub it before the app boots so the door has a real room to show.
const ROOMS={venues:[{venueId:'vtest0001',name:'HITMANS VIP AFTER SPOT',city:'Tallahassee',url:'http://127.0.0.1:1/nope',updatedAt:Date.now()}]};
const stub=(json)=>cdp('Page.addScriptToEvaluateOnNewDocument',{source:`
  (() => { const real = window.fetch;
    window.fetch = (input, init) => {
      const u = String(input && input.url ? input.url : input);
      if (u.includes('venues.json')) ${json?`return Promise.resolve(new Response(${JSON.stringify(JSON.stringify(json))},{status:200,headers:{'Content-Type':'application/json'}}));`:`return Promise.reject(new Error('directory unreachable'));`}
      return real(input, init); }; })();`});

await stub(ROOMS);
await cdp('Page.navigate',{url:appUrl});await settle(2500);
await js(`if(navigator.serviceWorker)navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister()));localStorage.setItem('hvas_hub_off','1');return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(3000);

console.log('A ROOM IS LISTED — TAP IT, DO NOT TYPE');
ok(await tap('Connect to venue'),'the connect panel opens');
await settle(2000);
const panel=await panelText();
console.log('   [panel]',panel);
ok(/hitmans vip after spot/i.test(panel),'the room is listed by name');
ok(/join/i.test(panel),'with one tap to join it');
ok(await addrBoxes()===0,'and no address box asking to be typed into');

console.log('\nSCAN VENUE QR');
ok(await tap('Scan venue QR'),'the scanner opens');
await settle(3500);
const box=await js(`
  const v=document.querySelector('.qr-scan video'); if(!v) return 'no video';
  const r=v.getBoundingClientRect(); const cs=getComputedStyle(v);
  return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),opacity:cs.opacity,cls:v.className,
    vw:v.videoWidth,vh:v.videoHeight,playing:!v.paused});`);
console.log('   [video]',box);
const b=JSON.parse(box);
ok(b.w>100&&b.h>100,`the camera window has a real size on screen (${b.w}x${b.h})`);
ok(Number(b.opacity)===1,`and is actually visible (opacity ${b.opacity})`);
ok(b.cls.includes('live'),'the live class lands once a frame arrives');
ok(b.vw>0&&b.vh>0,`real frames are coming from the camera (${b.vw}x${b.vh})`);
ok(b.playing,'and the preview is playing, not frozen');
const aim=await js(`return document.querySelector('.qr-scan')?.innerText.replace(/\\n/g,' / ')||''`);
console.log('   [reads]',aim);
ok(/align qr code here/i.test(aim),'the aiming guide is on screen');
ok(!/camera off|blocked|secure/i.test(aim),'and no camera error');

console.log('\nBUT AN EMPTY DIRECTORY STILL LETS YOU IN');
// Nothing to tap means a hand-typed address is the only way into the room.
// Taking it away in that case would strand somebody at the door.
await stub(null);
await cdp('Page.navigate',{url:appUrl});await settle(3000);
await tap('Connect to venue');await settle(2500);
const empty=await panelText();
console.log('   [panel]',empty);
ok(await addrBoxes()===1,'the address box comes back when no room can be tapped');
ok(/no rooms listed yet/i.test(empty),'and says why it is there');

console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();process.exit(fail?1:0);
