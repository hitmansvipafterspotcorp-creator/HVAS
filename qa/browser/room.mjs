// THE ROOM, on a phone.
//
// Two members actually using it: posting, reacting, commenting, following,
// messaging each other, and blocking. Driven in real Chromium, because the
// argument for building this at all is that a private room is worth more than
// an open one — and that argument is worth nothing if the thing is worse to
// use than the apps it replaces.
//
// The assertion this suite exists for, above every feature: a member's contact
// and door number must appear NOWHERE on any of these screens. A screenshot of
// the room must never be a screenshot of somebody's identity.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { onboard } = await import('/home/claude/hvas/server/test-helpers.mjs');
const { server: api } = createApp({ dataDir: `/tmp/hvas-room-${Date.now()}` });
await new Promise(r=>api.listen(0,r));
const API=`http://127.0.0.1:${api.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const venue=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const inv=await call('POST','/staff/invite',{name:'Kenya',role:'host'},venue);
const owner=(await call('POST','/auth/staff/claim',{code:inv.body.code})).body.token;
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});
  return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const nova=await mk('850-963-0001','Nova');
const trina=await mk('850-963-0002','Trina');
await onboard(call,nova.token,{role:'NAILS',program:'HOUSING'});
await onboard(call,trina.token,{role:'DJ',program:'HOUSING'});

const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9499;
const chrome=spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-room-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60&&!wsUrl;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)wsUrl=p.webSocketDebuggerUrl;}catch{}if(!wsUrl)await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const w=new Map();const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown'){const d=String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'');
    if(!/ServiceWorker/i.test(d))errors.push(d.split('\n')[0].slice(0,140));}});
// Every call gets a deadline. Without one a single lost response — a reply
// that arrives while the page is navigating, a socket that drops — parks the
// whole suite on one await forever. This ran SIX HOURS on a single step
// before the timeout existed, which reads as a hung machine rather than as a
// failing test, and is how a suite stops being able to tell you anything.
const cdp=(m,p={})=>new Promise(res=>{
  const i=++id;
  const t=setTimeout(()=>{ if(w.has(i)){ w.delete(i); console.log(`   [cdp timeout] ${m}`); res({}); } }, 15000);
  w.set(i,(msg)=>{ clearTimeout(t); res(msg); });
  ws.send(JSON.stringify({id:i,method:m,params:p}));
});
await cdp('Runtime.enable');await cdp('Page.enable');
const js=async e=>(await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const jsA=async e=>(await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const shot=async n=>{if(!SHOT)return;const r=await cdp('Page.captureScreenshot',{format:'png'});if(r.result?.data)await writeFile(join(SHOT,n),Buffer.from(r.result.data,'base64'));};
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const text=()=>js(`return (document.body.innerText||'').replace(/\\n+/g,' / ')`);
const type=(sel,v)=>js(`const el=document.querySelector(${JSON.stringify(sel)});if(!el)return false;
  const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(v)});
  el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const pick=(sel,v)=>js(`const el=document.querySelectorAll(${JSON.stringify(sel)})[0];if(!el)return false;
  const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(v)});
  el.dispatchEvent(new Event('change',{bubbles:true}));return true;`);
// Getting to a tab on the earn screen. The screen transition is animated, so
// this waits for the tab to actually be there rather than guessing at it.
const waitFor=async(label,tries=20)=>{for(let i=0;i<tries;i++){
  if(await js(`const t=${JSON.stringify(label)}.toLowerCase();return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent)`))return true;
  await settle(500);}return false;};
// The screen transition refuses a navigate while it is running, so a single
// tap can land on nothing and look like a broken button. This keeps tapping
// until the earn screen is actually up, which is what a person would do.
// Nothing sits above the pass any more — the QR is what a member needs with
// somebody waiting behind them, so earning lives one tap away under Account.
const toAccount=()=>js(`const b=[...document.querySelectorAll('.mem-tab')].find(b=>(b.innerText||'').trim()==='Account');if(!b)return false;b.click();return true;`);
const openEarn=async(tab)=>{
  let on=false;
  for(let i=0;i<24&&!on;i++){
    on=await js(`return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').trim()==='Bring people')`);
    if(on)break;
    // Get there from wherever this actually is. After a reload the boot
    // transition can still be running, which leaves the app on the door with
    // none of these buttons on it — and a loop that only ever taps the last
    // step spins on that door until it gives up.
    await tap('Enter'); await settle(250);
    await toAccount(); await settle(350);
    await tap('Get paid here');
    await settle(900);
  }
  // A failure here is worth a sentence rather than a bare false — otherwise the
  // eight assertions that depend on it all fail saying nothing about why.
  if(!on){ console.log('   [openEarn gave up on]', (await text()).slice(0,200)); return false; }
  await settle(600);
  if(!tab)return true;
  for(let i=0;i<10;i++){ if(await tap(tab))break; await settle(500); }
  await settle(2200);return true;
};
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};
const openRoom=async(tab)=>{
  let on=false;
  for(let i=0;i<24&&!on;i++){
    on=await js(`return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').trim()==='Who’s in')`);
    if(on)break;
    await tap('Enter'); await settle(250);
    await toAccount(); await settle(300);
    await tap('The Room'); await settle(900);
  }
  if(!on){ console.log('   [openRoom gave up on]',(await text()).slice(0,180)); return false; }
  await settle(500);
  if(!tab) return true;
  for(let i=0;i<10;i++){ if(await tap(tab)) break; await settle(400); }
  await settle(1600); return true;
};

const now=Date.now();
await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
const as=async(who,name,contact)=>{
  await js(`localStorage.clear();localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});
    localStorage.setItem('hvas_api_token',${JSON.stringify(who.token)});
    localStorage.setItem('hvas_api_member_id',${JSON.stringify(who.member?.id||'')});
    localStorage.setItem('hvas_auth_v1',JSON.stringify({member:{name:${JSON.stringify(name)},contact:${JSON.stringify(contact)},since:${now}}}));
    localStorage.setItem('hvas_member_v1',JSON.stringify({tier:'Monthly',vip:false,number:${JSON.stringify(who.member?.number||'HV-1-1')},payment:'card',paid:300,name:${JSON.stringify(name)},contact:${JSON.stringify(contact)},purchasedAt:${now},expiresAt:${now+30*86400000},status:'active',entries:1,loyalty:1,tickets:3,ticketsNight:'x',mealUsed:false}));return 1;`);
  await cdp('Page.navigate',{url:appUrl});await settle(7500);
  await tap('Enter');await settle(3500);
};

console.log('IT IS ON THE CARD, UNDER ACCOUNT');
await as(nova,'Nova','850-963-0001');
ok(await openRoom(),'the room opens');
const r0=await text();
console.log('   [room]', r0.slice(0,300));
ok(/Feed/.test(r0)&&/Who’s in/.test(r0)&&/Messages/.test(r0),'feed, people and messages are all there');
// A placeholder never appears in innerText, so this asks the DOM directly:
// is there a box to write in, and is it ABOVE the first post?
ok(await js(`const t=document.querySelector('.rm-compose .jub-textarea');return !!t&&/Say something/i.test(t.placeholder||'')`),
   'and the first thing on it is a box to write in, not a wall to read');
ok(await js(`const c=document.querySelector('.rm-compose');const f=document.querySelector('.rm-post,.dash-empty');
  return !!c&&!!f&&(c.compareDocumentPosition(f)&Node.DOCUMENT_POSITION_FOLLOWING)>0`),
   'and it sits above the feed rather than under it');
await shot('room-0-feed.png');

console.log('\nSHE POSTS');
await type('.rm-compose .jub-textarea','Chairs open Friday, gel and chrome.');
await settle(500);
ok(await tap('Post'),'she posts');
await settle(3000);
const r1=await text();
ok(/Chairs open Friday/.test(r1),'it is in the room');
ok(/Nail tech/.test(r1),'with what she does beside her name');
await shot('room-1-posted.png');

console.log('\nA MOMENT IS MARKED AS PASSING THROUGH');
ok(await tap('Stays up'),'she can choose for the next one to disappear');
await settle(500);
ok(await js(`return !!document.querySelector('.rm-kind.on')`),'and the choice shows on the button');

console.log('\nWHAT THE ROOM MUST NEVER SHOW');
// The whole argument for a closed room collapses if it leaks the things the
// door holds. Checked as raw text, on the rendered page.
const page=await text();
ok(!page.includes(nova.member.number),'her own door number is not on the screen');
ok(!/850-963-000/.test(page),'nor is anybody’s phone number');
ok(!/HV-\d+-\d+/.test(page),'no member number of any kind');

console.log('\nTHE OTHER MEMBER SEES IT, AND JOINS IN');
await as(trina,'Trina','850-963-0002');
ok(await openRoom(),'Trina opens the room');
const t0=await text();
ok(/Chairs open Friday/.test(t0),'she can see Nova’s post');
ok(await js(`const b=[...document.querySelectorAll('.rm-react')].find(x=>x.innerText.includes('🔥'));if(!b)return false;b.click();return true;`),
   'she reacts to it');
await settle(2500);
ok(await js(`return [...document.querySelectorAll('.rm-react')].some(x=>/🔥\\s*1/.test(x.innerText))`),
   'and the count moves');
await shot('room-2-reacted.png');
ok(await js(`const b=[...document.querySelectorAll('.rm-react')].find(x=>x.innerText.includes('💬'));if(!b)return false;b.click();return true;`),
   'she opens the comments');
await settle(2000);
await type('.rm-comment-add .jub-input','what do you charge');
await settle(400);
ok(await tap('Send'),'and says something');
await settle(2500);
ok(/what do you charge/.test(await text()),'the comment is there');

console.log('\nTHE DIRECTORY IS WHY A ROOM LIKE THIS IS WORTH JOINING');
ok(await openRoom('Who’s in'),'she opens who is in');
const whoText=await text();
console.log('   [who]', whoText.slice(0,300));
ok(/Nova/.test(whoText),'Nova is listed');
ok(/Nail tech/.test(whoText),'by what she does');
ok(!/850-963/.test(whoText)&&!/HV-\d+-\d+/.test(whoText),'and the directory holds nobody’s contact or number');
await shot('room-3-who.png');

console.log('\nMESSAGES, WHICH NOBODY AT THE VENUE READS');
ok(await js(`const b=[...document.querySelectorAll('.rm-person .bingo-btn')].find(x=>/Message/.test(x.innerText));if(!b)return false;b.click();return true;`),
   'she messages Nova from the directory');
await settle(3000);
await type('.rm-comment-add .jub-input','booking you for saturday');
await settle(400);
ok(await tap('Send'),'she sends it');
await settle(3000);
const th=await text();
ok(/booking you for saturday/.test(th),'it is in the thread');
await shot('room-4-thread.png');
// And the house genuinely cannot read it — proven against the server, not the screen.
const venueRead=await call('GET','/room/thread?with='+nova.member.id,null,venue);
ok(venueRead.status===401,'the venue cannot open that conversation at all');

console.log('\nNOVA GETS IT');
await as(nova,'Nova','850-963-0001');
ok(await openRoom('Messages'),'she opens messages');
const m0=await text();
ok(/Trina/.test(m0),'Trina is in her conversations');
ok(/nobody at the venue reads these/i.test(m0),'and the screen says outright that nobody at the venue reads them');
await shot('room-5-messages.png');

console.log('\nHER OWN PAGE IS HERS TO WRITE');
ok(await openRoom('You'),'she opens her own page');
await type('.jub-form input[placeholder="@yourname"]','danadoesnails');
await settle(400);
await type('.jub-form .jub-textarea','Gel, chrome, and a chair on Tennessee St.');
await settle(400);
ok(await tap('Save'),'she sets a handle and a bio');
await settle(3000);
const y=await text();
ok(/danadoesnails/.test(y),'the handle sticks');
ok(/never shown in the room/i.test(y),'and she is told her contact and number are never shown');
await shot('room-6-you.png');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail?1:0);
