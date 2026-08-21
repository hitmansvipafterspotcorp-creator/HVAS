// Solo plays by the venue's rules: a LIP SYNC square is performed for, never
// tapped, and passing loses it for the round. Driven in a real browser because
// solo is entirely client-side — no backend assertion can reach it.
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
// Solo needs no venue at all — that is the point of it.
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  '--remote-debugging-port=9360',`--user-data-dir=/tmp/cdp-solo-${Date.now()}`,'--window-size=932,430',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60;i++){try{const l=await(await fetch('http://127.0.0.1:9360/json/list')).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl){wsUrl=p.webSocketDebuggerUrl;break;}}catch{}await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);
await new Promise((r,j)=>{ws.addEventListener('open',r);ws.addEventListener('error',j);});
let id=0;const w=new Map();
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const js=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails)return{__err:String(r.result.exceptionDetails.text).slice(0,160)};return r.result?.result?.value;};
const jsA=async e=>{const r=await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true});return r.result?.result?.value;};
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const text=async()=>(await js('return document.body?document.body.innerText:""'))||'';
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const tapAny=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const hit=s=>[...document.querySelectorAll(s)].find(b=>(b.innerText||'').toLowerCase().includes(t)&&b.offsetParent&&(b.innerText||'').length<220);const el=hit('button')||hit('a,[role="button"]')||hit('li,article,div');if(!el)return false;el.click();return true;`);
const fill=(ph,v)=>js(`const el=[...document.querySelectorAll('input')].find(i=>(i.placeholder||'').includes(${JSON.stringify(ph)}));if(!el)return false;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const openTile=t=>js(`const b=document.querySelector('[data-target="${t}"]');if(!b)return false;b.click();return true;`);
const dropSW=()=>jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return true;`);
let pass=0,fail=0; const ok=(c,m)=>{if(c){pass++;console.log('  ✓',m);}else{fail++;console.log('  ✗',m);}};

await cdp('Page.navigate',{url:appUrl}); await settle(2000); await dropSW();
await js(`localStorage.setItem('hvas_hub_off','1');localStorage.removeItem('hvas_hub');return 1;`);
await cdp('Page.navigate',{url:appUrl}); await settle(1500); await dropSW();
await cdp('Page.navigate',{url:appUrl}); await settle(2500);

console.log('SOLO NEEDS NO VENUE');
await tapAny('Member Sign In'); await settle(1400);
await fill('First name','Solo'); await fill('(850)','850-960-0001'); await settle(400);
await tap('Send code'); await settle(1500);
// Demo/local auth: no backend, so the app issues its own code path.
await tap('Verify')||await tap('Continue'); await settle(2500);
let reached=false;
for(let i=0;i<20&&!reached;i++){await openTile('lobby');await settle(1300);reached=/solo vs cpu/i.test(await text());}
ok(reached,'Lip Sync Bingo opens with no venue connected');
await tap('Solo vs CPU'); await settle(1400);
ok(/three regulars|start solo/i.test(await text()),'the Solo tab explains the ladder');
ok(/lip sync squares you perform for/i.test(await text()),'and says lip sync squares are performed for');

console.log('\nA ROUND');
await tap('Start Solo Round'); await settle(1500);
const tiles=await js(`return document.querySelectorAll('.k-tile').length`);
ok(tiles===25,`a 5x5 card is dealt (${tiles} squares)`);

// Wait for a LIP SYNC square that has been called to appear tappable.
const lipInfo=await js(`
  const t=[...document.querySelectorAll('.k-tile--lipsync')];
  return t.length;`);
ok(lipInfo>0,`the card carries lip sync squares (${lipInfo})`);

// Drive the clock: the call loop reveals squares over time.
let opened=false;
for(let i=0;i<40&&!opened;i++){
  await settle(1200);
  // Tap every enabled lip sync tile; only a called one does anything.
  await js(`for(const b of document.querySelectorAll('.k-tile--lipsync')) if(!b.disabled) b.click();`);
  await settle(500);
  opened=/perform it|lip sync battle/i.test(await text());
}
ok(opened,'tapping a called LIP SYNC square opens a battle instead of covering it');
const body=await text();
ok(/pass and the square is gone/i.test(body),'the battle warns that passing forfeits the square');
ok(/perform it/i.test(body),'and offers to perform');

console.log('\nPASSING FORFEITS IT');
await tap('Pass'); await settle(1500);
const lost=await js(`return document.querySelectorAll('.k-tile--lost').length`);
ok(lost===1,`the passed square is marked gone for the round (${lost})`);
const dead=await js(`const b=document.querySelector('.k-tile--lost');return b?b.disabled:null;`);
ok(dead===true,'and cannot be tapped again');

console.log('\nPERFORMING — and the take is yours to post');
// Open another battle; the fake camera/mic above make the recorder real.
let again=false;
for(let i=0;i<40&&!again;i++){
  await settle(1200);
  await js(`for(const b of document.querySelectorAll('.k-tile--lipsync')) if(!b.disabled) b.click();`);
  await settle(500);
  again=/perform it/i.test(await text());
}
ok(again,'a second lip sync square opens its own battle');
await tap('Perform it'); await settle(3000);
let stageText=await text();
ok(!/could not|camera and mic access is needed/i.test(stageText),
   `the recorder opens on camera${/camera and mic/i.test(stageText)?' (blocked)':''}`);
// Record a short take, then stop.
// Scope the taps to the stage: the lobby has a "Record" TAB that will happily
// swallow a loose match and navigate away from the battle entirely.
const stageTap = (n) => js(`
  const t = ${JSON.stringify(n)}.toLowerCase();
  const root = document.querySelector('.battle-stage'); if (!root) return 'no stage';
  const el = [...root.querySelectorAll('button')].find(b => (b.innerText||'').toLowerCase().includes(t) && !b.disabled);
  if (!el) return 'no button'; el.click(); return 'tapped';`);
ok((await stageTap('Start performing')) === 'tapped', 'the take starts recording');
await settle(3500);
ok((await stageTap('Finish take')) === 'tapped', 'and the performer can finish it');
await settle(1500);
// The room decides, then the result.
let settled=false;
for(let i=0;i<20&&!settled;i++){await settle(900);settled=/you took it|they took it/i.test(await text());}
ok(settled,'the battle reaches a verdict after the performance');
const res=await text();
ok(/back to my card/i.test(res),'and offers the way back to the card');
const shareable=await js(`return !!document.querySelector('.share-take, .share-preview')`);
ok(shareable,'the take is offered back to post — win or lose');
const shareBtns=await js(`const el=document.querySelector('.share-take');return el?[...el.querySelectorAll('button')].map(b=>(b.innerText||'').trim()).join(' | '):'none';`);
console.log('   [share offers]', shareBtns);

console.log('\nKEPT ON THE PHONE');
// The take should already be in the device's own store, not on any server.
const stored = await jsA(`
  return await new Promise((res) => {
    const r = indexedDB.open('hvas-takes', 1);
    r.onsuccess = () => { const db = r.result;
      const os = db.transaction('takes','readonly').objectStore('takes');
      const all = os.getAll();
      all.onsuccess = () => { res((all.result||[]).map(t => ({ artist:t.artist, song:t.song, mode:t.mode, size:t.size }))); db.close(); };
      all.onerror = () => { res('read-failed'); db.close(); };
    };
    r.onerror = () => res('open-failed');
  });`);
ok(Array.isArray(stored) && stored.length >= 1, `the take is written to this phone's own store (${Array.isArray(stored)?stored.length:stored})`);
if (Array.isArray(stored) && stored[0]) {
  ok(stored[0].size > 0, `and it is a real video, not an empty record (${Math.round((stored[0].size||0)/1024)} KB)`);
  ok(stored[0].mode === 'solo', 'tagged as a solo take');
  ok(!!stored[0].artist, `with the song it was performed to (${stored[0].artist} — ${stored[0].song})`);
}

// Survives a reload — that is what "saved" has to mean.
await cdp('Page.navigate',{url:appUrl}); await settle(3000);
const after = await jsA(`
  return await new Promise((res) => {
    const r = indexedDB.open('hvas-takes', 1);
    r.onsuccess = () => { const db=r.result; const os=db.transaction('takes','readonly').objectStore('takes');
      const c=os.count(); c.onsuccess=()=>{res(c.result); db.close();}; c.onerror=()=>{res(-1); db.close();}; };
    r.onerror = () => res(-1);
  });`);
ok(after >= 1, `the take is still there after closing and reopening the app (${after})`);

// And it is reachable in the Record tab with no venue connected at all.
// A reload drops back to the door — the session is remembered, so this is one
// tap rather than signing in again.
await tapAny('Enter ·') || await tapAny('Member Sign In');
await settle(2500);
let onRecord=false;
for(let i=0;i<20&&!onRecord;i++){await openTile('lobby');await settle(1300);onRecord=/solo vs cpu/i.test(await text());}
await tap('Record'); await settle(1800);
const rec = await text();
ok(/your takes/i.test(rec), 'the Record tab shows the takes shelf with no venue connected');
ok(/on this phone/i.test(rec), 'and says plainly that they are on this phone');
const rows = await js(`return document.querySelectorAll('.take-row').length`);
ok(rows >= 1, `the saved take is listed (${rows})`);

console.log(`\n${pass} passed, ${fail} failed`);
if(fail){const t=await text();console.log('\n--- screen ---\n'+t.slice(0,900));}
ws.close();chrome.kill();web.close();
process.exit(fail?1:0);
