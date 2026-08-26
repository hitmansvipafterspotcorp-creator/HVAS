// Four ways to make money here, on a phone.
//
// This suite drives the screen a member actually gets paid through, and it is
// looking for one thing above every feature on it: that the money is HONEST on
// screen before anybody commits to anything.
//
//   §46 — the venue's cut is stated at the top, and again as "you keep X of Y"
//         BEFORE a listing goes up. Never discovered afterwards.
//   §41 — a licence somebody has bought but not paid for reads
//         "PENDING — NOT SETTLED", not "yours".
//   §18 — a booking stake is a performance bond that comes back. The screen
//         must not sell it as an investment.
//   §55 — a shared venue code can READ the money queue and cannot move it.
//
// A licence is a grant of use and not a sale of the work, which is why Nova
// can license the same track twice and still own it at the end.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createHash } from 'node:crypto';
process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { onboard } = await import('/home/claude/hvas/server/test-helpers.mjs');
const { server: api } = createApp({ dataDir: `/tmp/hvas-earn-${Date.now()}` });
await new Promise(r=>api.listen(0,r));
const API=`http://127.0.0.1:${api.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const venue=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const inv=await call('POST','/staff/invite',{name:'Kenya',role:'host'},venue);
const owner=(await call('POST','/auth/staff/claim',{code:inv.body.code})).body.token;
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});
  return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const nova=await mk('850-960-0001','Nova');      // nail tech who also makes beats
const trina=await mk('850-960-0002','Trina');    // buys, books, and brings people
await onboard(call,nova.token,{role:'NAILS',program:'HOUSING'});
await onboard(call,trina.token,{role:'PROMOTER',program:'HOUSING'});

const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9496;
const chrome=spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-earn-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
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
const openEarn=async(tab)=>{
  let on=false;
  for(let i=0;i<24&&!on;i++){
    on=await js(`return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').trim()==='Bring people')`);
    if(on)break;
    await tap('Get paid here');
    await settle(900);
  }
  if(!on)return false;
  await settle(600);
  if(!tab)return true;
  for(let i=0;i<10;i++){ if(await tap(tab))break; await settle(500); }
  await settle(2200);return true;
};
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};

// One browser, two people. localStorage is per-origin, so swapping who is
// signed in and reloading is the same act as handing the phone over.
const now=Date.now();
await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
const as=async(who,name,contact)=>{
  await js(`localStorage.clear();localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});
    localStorage.setItem('hvas_api_token',${JSON.stringify(who.token)});
    localStorage.setItem('hvas_api_member_id',${JSON.stringify(who.member?.id||'')});
    localStorage.setItem('hvas_auth_v1',JSON.stringify({member:{name:${JSON.stringify(name)},contact:${JSON.stringify(contact)},since:${now}}}));
    localStorage.setItem('hvas_member_v1',JSON.stringify({tier:'Monthly',vip:false,number:${JSON.stringify(who.member?.number||'HV-1-1')},payment:'card',paid:300,name:${JSON.stringify(name)},contact:${JSON.stringify(contact)},purchasedAt:${now},expiresAt:${now+30*86400000},status:'active',entries:1,loyalty:1,tickets:3,ticketsNight:'x',mealUsed:false}));return 1;`);
  await cdp('Page.navigate',{url:appUrl});await settle(7000);
  await tap('Enter');await settle(3500);
};
// The house comes in the way the house actually comes in: five taps on the
// fine print, then a named sign-in code. Money needs a name behind it (§55),
// so this is never the shared venue code.
const asHouse=async(code)=>{
  await js(`localStorage.clear();localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});return 1;`);
  await cdp('Page.navigate',{url:appUrl});await settle(7000);
  await js(`const b=document.querySelector('.door-fine');for(let i=0;i<5;i++)b.click();return 1;`);
  await settle(1500);
  await tap('Staff Check-In');await settle(1500);
  await type('.auth-card input',code);await settle(400);
  await tap('Unlock');await settle(4500);
};

console.log('THE WAY IN IS ON THE CARD');
await as(nova,'Nova','850-960-0001');
const card=await text();
console.log('   [card]', card.slice(0,260));
ok(/get paid here/i.test(card),'a member meets earning on the screen they land on');
ok(/give to a cause/i.test(card),'and giving sits right beside it');
await shot('earn-0-card.png');

console.log('\nWHAT THE VENUE TAKES IS SAID FIRST (§46)');
ok(await openEarn(),'the earn screen opens');
await settle(3000);
const e0=await text();
console.log('   [earn]', e0.slice(0,300));
ok(/venue keeps 10%/i.test(e0),'the cut is at the top of the screen, before anything is listed');
ok(/community reserve/i.test(e0),'and it says where it goes');
ok(/Sell/.test(e0)&&/Gigs/.test(e0)&&/License/.test(e0)&&/Bring people/.test(e0),'all four ways are on one screen');
await shot('earn-1-tabs.png');

console.log('\nSELLING: YOU KEEP X OF Y, BEFORE YOU LIST');
await type('.jub-form .jub-input',"Full set, gel");
await settle(300);
await js(`const els=[...document.querySelectorAll('.jub-form .jub-input')];const el=els.find(e=>e.getAttribute('inputMode')==='decimal'||e.inputMode==='decimal');if(!el)return false;
  const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,'60');el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
await settle(700);
const keep=await js(`const el=document.querySelector('.earn-keep');return el?el.innerText:''`);
console.log('   [keep]', keep);
ok(/\$54\.00/.test(keep)&&/\$60\.00/.test(keep),'it says you keep $54.00 of $60.00 before the listing goes up');
await shot('earn-2-keep.png');
ok(await tap('Put it up'),'the listing goes up');
await settle(3000);
const e1=await text();
ok(/You are selling/i.test(e1)&&/Full set, gel/.test(e1),'and it is hers, listed');

console.log('\nBUYING: THE SHOP KNOWS WHAT SOMEBODY DOES');
await as(trina,'Trina','850-960-0002');
await openEarn();
const s1=await text();
console.log('   [shop]', s1.slice(0,400));
ok(/Full set, gel/.test(s1),'Nova’s listing is in the room’s shop');
ok(/Nail tech/.test(s1),'and it says she is a nail tech, so a buyer knows who they are buying from');
ok(await tap('Buy'),'it can be bought');
await settle(3000);

console.log('\nMONEY MOVES WHEN A NAMED PERSON SAYS IT DID (§41, §55)');
const shared=(await call('GET','/house/money',null,venue)).body;
ok(shared.canSettle===false,'a shared venue code cannot settle anything');
ok(shared.orders.length===1,'but it can see what is outstanding');
const namedQ=(await call('GET','/house/money',null,owner)).body;
ok(namedQ.canSettle===true,'a named sign-in can');
ok(namedQ.orders[0].toSellerCents===5400,'the queue shows the seller getting $54.00, not $60.00');
const deskInv=await call('POST','/staff/invite',{name:'Kenya Desk',role:'host'},owner);
await asHouse(deskInv.body.code);await settle(2000);
const p1=await text();
console.log('   [pulse]', p1.slice(0,320));
ok(/waiting on money|waiting to be paid/i.test(p1),'the owner’s front door says somebody is waiting on money');
await shot('earn-3-pulse.png');
ok(await tap('Settle them'),'and it goes straight there');
await settle(3000);
const m1=await text();
console.log('   [money]', m1.slice(0,400));
ok(/Sales to confirm/i.test(m1),'the money screen has the sale on it');
ok(/\$54\.00/.test(m1),'showing what the seller actually gets');
await shot('earn-4-house.png');
ok(await tap('Money in'),'a named person confirms the money arrived');
await settle(3000);

console.log('\nBOOKING IS A STAKE, NOT A YIELD (§18)');
await as(trina,'Trina','850-960-0002');
await openEarn('Gigs');
const g0=await text();
console.log('   [gigs]', g0.slice(0,320));
ok(/comes straight back/i.test(g0),'the screen says the stake comes back');
ok(/not an investment/i.test(g0),'and says outright that it is not an investment');
ok(!/yield|interest|returns/i.test(g0),'with no yield language anywhere near it');
ok(/Full set, gel/.test(g0),'Nova can be booked from her listing');
await shot('earn-5-gigs.png');
ok(await tap('Book'),'a booking can be started');
await settle(800);
await type('input[type="datetime-local"]',new Date(now+7*86400000).toISOString().slice(0,16));
await settle(600);
const g1=await js(`const el=document.querySelector('.earn-keep');return el?el.innerText:''`);
console.log('   [deposit]', g1);
ok(/counts toward the price/i.test(g1),'the deposit counts toward the price rather than sitting on top of it');
ok(await tap('Ask for it'),'the booking is asked for');
await settle(3000);
const g2=await text();
ok(/Waiting on them/i.test(g2),'and it is waiting on the provider');

// Nova takes it; the house secures it; Nova works it; Trina confirms; the house pays out.
await as(nova,'Nova','850-960-0001');
await openEarn('Gigs');
const n1=await text();
ok(/Take it/.test(n1),'the provider is the one asked to take it');
ok(await tap('Take it'),'she takes it');
await settle(3000);
const bk=(await call('GET','/house/money',null,owner)).body.toSecure[0];
ok(!!bk&&bk.provider==='Nova','the house queue now has a booking to secure');
ok((await call('POST','/gig/secure',{bookingId:bk.bookingId},owner)).status===200,'the deposit lands and it is really booked');
await cdp('Page.navigate',{url:appUrl});await settle(7000);await tap('Enter');await settle(3500);
ok(await openEarn('Gigs'),'her gigs open again');
ok(await tap('Done'),'she says the work is done');
await settle(3000);
await as(trina,'Trina','850-960-0002');
ok(await openEarn('Gigs'),'his gigs open');
const t1=await text();
ok(/They did it/.test(t1),'the client is the one who confirms it, not the provider');
ok(await tap('They did it'),'she confirms it');
await settle(3000);
const payout=(await call('GET','/house/money',null,owner)).body.toPayOut[0];
console.log('   [payout]', JSON.stringify(payout));
ok(payout.toProviderCents===5400&&payout.toVenueCents===600,'the payout is worked out before anybody presses it');
ok((await call('POST','/gig/settle',{bookingId:payout.bookingId},owner)).status===200,'and it settles');
await as(nova,'Nova','850-960-0001');
ok(await openEarn('Gigs'),'her gigs open once more');
const n2=await text();
console.log('   [settled]', n2.slice(0,300));
ok(/You got \$54\.00/.test(n2),'she can see what she was actually paid');
ok(!/stake lost/i.test(n2),'and her stake was not taken from her');
await shot('earn-6-settled.png');

console.log('\nA LICENCE IS A GRANT OF USE, NOT A SALE OF THE WORK');
await tap('License');await settle(2500);
const l0=await text();
console.log('   [license]', l0.slice(0,320));
ok(/still own it/i.test(l0),'the screen says she still owns it afterwards');
ok(/license it again/i.test(l0),'and that she can license it again');
// Registering happens on the phone: the file is hashed here and never uploaded.
ok(await tap('Your works'),'the creator’s desk is a tap away');await settle(2000);
const fileHash='sha256:'+createHash('sha256').update('a track Nova made').digest('hex');
const reg=await call('POST','/ip/performance',{contentHash:fileHash,kind:'RECORDING',title:'Tennessee Street',song:'Tennessee Street',performedAt:now},nova.token);
ok(reg.status===200,'a work registers on its fingerprint');
await cdp('Page.navigate',{url:appUrl});await settle(7000);await tap('Enter');await settle(3500);
ok(await openEarn('License'),'back to licensing');
ok(await tap('Your works'),'her desk opens');await settle(2500);
const l1=await text();
console.log('   [desk]', l1.slice(0,600));
ok(/Tennessee Street/.test(l1),'and it shows up on her desk');
ok(await tap('License it'),'she can license it');
await settle(1200);
const grants=await js(`const el=document.querySelector('.jub-form .jub-note');return el?el.innerText:''`);
console.log('   [grants]', grants);
ok(grants.length>10,'the screen says in words what that licence actually lets somebody do');
await js(`const els=[...document.querySelectorAll('.jub-form .jub-input')];const el=els.find(e=>e.inputMode==='decimal');if(!el)return false;
  const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,'250');el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
await settle(600);
await shot('earn-7-offer.png');
ok(await tap('Put it up'),'she puts a licence up');
await settle(3000);

// AI training is never implied by anything else — it has to be chosen on purpose.
const terms=(await call('GET','/license/terms',null,nova.token)).body;
ok(terms.types.find(t=>t.id==='AI_TRAINING')?.neverImplied===true,'AI training is never bundled into another licence');

await as(trina,'Trina','850-960-0002');
ok(await openEarn('License'),'the licence shop opens');
const sh=await text();
console.log('   [shop]', sh.slice(0,360));
ok(/Tennessee Street/.test(sh)&&/\$250\.00/.test(sh),'the licence is in the shop at its price');
ok(await tap('Buy this licence'),'she buys it');
await settle(3000);
await tap('You hold');await settle(2000);
const held=await text();
console.log('   [held]', held.slice(0,320));
ok(/PENDING — NOT SETTLED/i.test(held),'§41: until the money is confirmed it is PENDING — NOT SETTLED');
await shot('earn-8-held.png');
const g=(await call('GET','/house/money',null,owner)).body.licenses[0];
ok((await call('POST','/license/settle',{grantId:g.grantId,received:true},owner)).status===200,'a named person confirms the money');
await cdp('Page.navigate',{url:appUrl});await settle(7000);await tap('Enter');await settle(3000);
ok(await openEarn('License'),'licensing opens again');
await tap('You hold');await settle(2200);
const held2=await text();
// The chip is uppercased by CSS, so this reads what a person actually sees.
ok(/LIVE/i.test(held2)&&!/PENDING/i.test(held2),'and only then is the licence live');
ok(await js(`return !!document.querySelector('.lic-hash')`),'the buyer holds the hash of the terms they agreed to');
// The two lines that decide whether somebody has been taken advantage of.
ok(/grant of use, not a sale/i.test(held2),'the licence says on its face that the creator still owns the work');
ok(/does NOT permit training a model/i.test(held2),'and states the AI training position rather than leaving it to silence');
// Nova still owns it: the same work can be licensed again to somebody else.
const still=(await call('GET','/license/mine',null,nova.token)).body;
ok(still.works[0].granted.length===1&&still.earnedCents===25000,'the creator was paid and still holds the work');

console.log('\nBRINGING PEOPLE PAYS ON MONEY THAT ARRIVED');
ok(await openEarn('Bring people'),'the promoter page opens');
const b0=await text();
console.log('   [bring]', b0.slice(0,320));
ok(/signup on its own does not pay/i.test(b0),'a signup on its own does not pay');
ok(await js(`const el=document.querySelector('.ref-code b');return !!el&&el.innerText.length>=6`),'she has a code big enough to read in a dark room');
await shot('earn-9-bring.png');

console.log('\nNOTHING LEAKS');
const leak=await text();
ok(!/HV-\d+-\d+/.test(leak.replace(new RegExp((trina.member?.number||'x').replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'),'')),
   'nobody else’s member number is on the screen');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail?1:0);
