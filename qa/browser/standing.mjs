// The relationship, on a phone.
//
// A private membership association owes its members three things that no
// number of features substitutes for: the document they signed in the words
// they signed it, the record held about them, and the way out. This drives all
// three on a real screen, because each of them is the kind of thing that can
// be "implemented" on the server and unreachable in the app.
//
// The one it is really guarding: leaving has to be genuinely available. A
// resignation buried where a member has to ask a person for it is not a right,
// it is a favour.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import('/home/claude/hvas/server/src/app.mjs');
const { onboard } = await import('/home/claude/hvas/server/test-helpers.mjs');
const { server: api } = createApp({ dataDir: `/tmp/hvas-stand-${Date.now()}` });
await new Promise(r=>api.listen(0,r));
const API=`http://127.0.0.1:${api.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const venue=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const inv=await call('POST','/staff/invite',{name:'Kenya',role:'host'},venue);
const owner=(await call('POST','/auth/staff/claim',{code:inv.body.code})).body.token;
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});
  return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
const nova=await mk('850-961-0001','Nova');
await onboard(call,nova.token,{role:'NAILS',program:'HOUSING'});
await call('POST','/membership/purchase',{tier:'Monthly',payment:'card'},nova.token);

const APP='/home/claude/hvas/hitmans_vip_membership_app/dist';
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9497;
const chrome=spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-stand-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
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
const waitBtn=async(label,tries=24)=>{for(let i=0;i<tries;i++){
  if(await js(`const t=${JSON.stringify(label)}.toLowerCase();return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent)`))return true;
  await settle(500);}return false;};
const open=async(tab)=>{
  let on=false;
  for(let i=0;i<24&&!on;i++){
    on=await js(`return [...document.querySelectorAll('button')].some(b=>(b.innerText||'').trim()==='What we hold')`);
    if(on)break;
    await tap('Your membership'); await settle(900);
  }
  if(!on)return false;
  await settle(600);
  if(!tab)return true;
  for(let i=0;i<10;i++){ if(await tap(tab))break; await settle(500); }
  await settle(1800); return true;
};

const now=Date.now();
await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
await js(`localStorage.clear();localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});
  localStorage.setItem('hvas_api_token',${JSON.stringify(nova.token)});
  localStorage.setItem('hvas_api_member_id',${JSON.stringify(nova.member?.id||'')});
  localStorage.setItem('hvas_auth_v1',JSON.stringify({member:{name:'Nova',contact:'850-961-0001',since:${now}}}));
  localStorage.setItem('hvas_member_v1',JSON.stringify({tier:'Monthly',vip:false,number:${JSON.stringify(nova.member?.number||'HV-1-1')},payment:'card',paid:300,name:'Nova',contact:'850-961-0001',purchasedAt:${now},expiresAt:${now+30*86400000},status:'active',entries:1,loyalty:1,tickets:3,ticketsNight:'x',mealUsed:false}));return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(8000);
await tap('Enter');await settle(3500);

console.log('IT IS ON THE CARD, NOT BURIED');
const card=await text();
ok(/your membership/i.test(card),'a member meets their own standing on the screen they land on');
ok(/how to leave/i.test(card),'and leaving is named there, not hidden behind it');
await shot('stand-0-card.png');

console.log('\nWHAT YOU SIGNED, IN THE WORDS YOU SIGNED IT');
ok(await open(),'the membership screen opens');
const c0=await text();
console.log('   [covenant]', c0.slice(0,340));
ok(/agreed to version/i.test(c0),'it says which version was agreed, and when');
ok(/Prosperity with duty/i.test(c0),'the clauses are there in full');
ok(/reserve is not anybody/i.test(c0),'including the one about whose money the reserve is');
ok(/I have read this/i.test(c0),'and the sentence actually agreed to');
ok(await js(`const e=document.querySelector('.lic-hash');return !!e&&/[0-9a-f]{8}/.test(e.innerText)`),
   'with a fingerprint of the document, so both sides can prove it is the same one');
await shot('stand-1-covenant.png');

console.log('\nWHAT THE ASSOCIATION HOLDS ABOUT YOU');
ok(await open('What we hold'),'the record opens');
const r0=await text();
console.log('   [record]', r0.slice(0,340));
ok(new RegExp(nova.member.number).test(r0),'their own number is on it');
ok(/Member since/i.test(r0),'when they joined');
ok(/Community Covenant/i.test(r0),'the agreement they made, with its version');
ok(/not kept after they are used/i.test(r0),'and what is NOT kept, which nobody would think to ask');
ok(await waitBtn('Save a copy'),'and they can take a copy away');
await shot('stand-2-record.png');

console.log('\nLEAVING IS AVAILABLE, AND HONEST ABOUT ITSELF');
ok(await open('Leaving'),'the way out opens');
const l0=await text();
console.log('   [leave]', l0.slice(0,400));
ok(/door stops/i.test(l0),'it says the door stops, which is what leaving means');
ok(/record stays/i.test(l0),'that the record is not erased');
ok(/come back/i.test(l0),'and that they can come back');
await shot('stand-3-leave.png');
ok(await tap('I want to leave'),'the button is real');
await settle(900);
ok(await tap('Resign my membership'),'and resigning goes through');
await settle(3500);

console.log('\nAND THE DOOR ACTUALLY STOPS');
const st=(await call('GET','/me/record',null,nova.token)).body;
ok(st.standing.state==='RESIGNED','the association has them as resigned');
const p=await call('GET','/pass/current',null,nova.token);
const at=p.body.pass
  ? await call('POST','/door/verify',{pass:p.body.pass},venue)
  : await call('POST','/door/verify',{number:nova.member.number},venue);
ok(at.body.ok===false,'the door does not admit them');
ok(at.body.status==='resigned','and says they resigned rather than accusing them of anything');
ok(st.agreements.length>=1,'while the agreement they made is still on their record');

console.log('\nCOMING BACK IS ONE TAP, FROM THE SAME SCREEN');
await cdp('Page.navigate',{url:appUrl});await settle(8000);await tap('Enter');await settle(3500);
ok(await open(),'they open their membership again');
const back=await text();
ok(/you have resigned/i.test(back),'it says where they stand');
ok(await tap('Rejoin'),'and rejoining is right there');
await settle(3500);
const after=(await call('GET','/me/record',null,nova.token)).body;
ok(after.standing.state==='MEMBER','they are a member again');
ok(after.standingHistory.length===2,'and both the leaving and the return are on the record');
const p2=await call('GET','/pass/current',null,nova.token);
ok((await call('POST','/door/verify',{pass:p2.body.pass},venue)).body.status==='granted','the door lets them in again');
await shot('stand-4-back.png');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail?1:0);
