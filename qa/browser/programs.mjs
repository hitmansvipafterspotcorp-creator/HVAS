// Belonging to a programme, giving to one, and asking for a seat on its board.
//
// The correction this suite exists to hold in place: a member does NOT pay into
// a programme. Playing bingo is not a donation, and routing an entry fee by
// affiliation would quietly turn a game entry into a contribution nobody chose
// to make. Belonging is an affiliation. There are exactly two ways a member
// puts something in, and both are asked for, and both are answered by a named
// person:
//
//   GIVE  — a voluntary amount, which is a PLEDGE until somebody confirms it.
//   SERVE — a named seat on a board, applied for by saying what you bring.
//
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE='HOST850';
const { createApp } = await import(new URL('../../server/src/app.mjs', import.meta.url).href);
const { onboard } = await import(new URL('../../server/test-helpers.mjs', import.meta.url).href);
const { server: api } = createApp({ dataDir: `/tmp/hvas-prog-${Date.now()}` });
await new Promise(r=>api.listen(0,r));
const API=`http://127.0.0.1:${api.address().port}`;
const call=async(m,p,b,t)=>{const r=await fetch(API+p,{method:m,headers:{'Content-Type':'application/json',...(t?{Authorization:`Bearer ${t}`}:{})},body:b?JSON.stringify(b):undefined});return{status:r.status,body:await r.json().catch(()=>({}))};};
const venue=(await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const inv=await call('POST','/staff/invite',{name:'Kenya',role:'host'},venue);
const owner=(await call('POST','/auth/staff/claim',{code:inv.body.code})).body.token;
// Deliberately NOT onboarded — this suite drives the real sign-up.
const mk=async(ph,nm)=>{const s=await call('POST','/auth/member/start',{contact:ph});
  return (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;};
await call('POST','/bingo/mode',{mode:'cash'},owner);
await call('POST','/bingo/split',{housePercent:1,worldPercent:1},owner);
const nova=await mk('850-950-0001','Nova');

const APP=new URL('../../hitmans_vip_membership_app/dist', import.meta.url).pathname;
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const PORT=9494;
const chrome=spawn('/opt/pw-browsers/chromium-1194/chrome-linux/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
  `--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-prog-${Date.now()}`,'--window-size=430,932','about:blank'],{stdio:'ignore'});
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
// Nothing is stacked over the pass any more: the QR is what a member needs in
// a queue, so the programme, earning and membership all live under Account.
const toAccount=()=>js(`const b=[...document.querySelectorAll('.mem-tab')].find(b=>(b.innerText||'').trim()==='Account');if(!b)return false;b.click();return true;`);
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};

const now=Date.now();
await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
await js(`localStorage.setItem('hvas_hub_off','1');localStorage.setItem('hvas_api_base',${JSON.stringify(API)});
  localStorage.setItem('hvas_api_token',${JSON.stringify(nova.token)});
  localStorage.setItem('hvas_api_member_id',${JSON.stringify(nova.member?.id||'')});
  localStorage.setItem('hvas_auth_v1',JSON.stringify({member:{name:'Nova',contact:'850-950-0001',since:${now}}}));
  localStorage.setItem('hvas_member_v1',JSON.stringify({tier:'Monthly',vip:false,number:${JSON.stringify(nova.member?.number||'HV-1-1')},payment:'card',paid:300,name:'Nova',contact:'850-950-0001',purchasedAt:${now},expiresAt:${now+30*86400000},status:'active',entries:1,loyalty:1,tickets:3,ticketsNight:'x',mealUsed:false}));return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(8000);
await tap('Enter');await settle(4000);

console.log('SIGNING IN IS NOT MEMBERSHIP');
const t0=await text();
console.log('   [step 1]', t0.slice(0,300));
ok(/community covenant/i.test(t0),'the first thing is the covenant, not a menu');
ok(/support the mission/i.test(t0),'it says supporting the mission is part of being here');
ok(/nobody owns it|owns it/i.test(t0),'and that the reserve belongs to nobody');
ok(await js(`return document.querySelectorAll('.onb-clause').length>=5`),'the whole thing is on screen, not behind a link');
await shot('onb-1-covenant.png');

console.log('\nAGREEING MOVES YOU ON');
ok(await tap('I agree'),'there is one button');
await settle(2500);
const t1=await text();
console.log('   [step 2]', t1.slice(0,260));
ok(/what do you do/i.test(t1),'next is what you do for a living');
const groups=await js(`return [...document.querySelectorAll('.onb-group strong')].map(e=>e.innerText.trim()).join(' | ')`);
console.log('   [groups]', groups);
ok(/Beauty & grooming/.test(groups)&&/Music & performance/.test(groups)&&/Trades/.test(groups),
   'grouped the way people would group themselves');
await shot('onb-2-work.png');

console.log('\nTHE WHOLE WORKING ECONOMY, NOT THREE BOXES');
ok(await js(`const b=[...document.querySelectorAll('.onb-group')].find(b=>/Beauty/.test(b.innerText));if(!b)return false;b.click();return true;`),
   'a group opens');
await settle(1200);
const roles=await js(`return [...document.querySelectorAll('.onb-role strong')].map(e=>e.innerText.trim()).join(' | ')`);
console.log('   [beauty]', roles);
ok(/Nail tech/.test(roles)&&/Barber/.test(roles)&&/Braider/.test(roles),'nail tech, barber and braider are all on it');
await shot('onb-3-roles.png');
ok(await js(`const b=[...document.querySelectorAll('.onb-role')].find(b=>/Nail tech/.test(b.innerText));if(!b)return false;b.click();return true;`),
   'picking one moves on');
await settle(2500);
const t2=await text();
console.log('   [step 3]', t2.slice(0,260));
ok(/which cause do you stand behind/i.test(t2),'third step is the programme');
await shot('onb-4-cause.png');

console.log('\nAND THE LAST STEP IS THE MEMBERSHIP ITSELF');
ok(await js(`const b=[...document.querySelectorAll('.prog-card')].find(b=>/Housing stability/.test(b.innerText));if(!b)return false;b.click();return true;`),
   'they stand behind one');
await settle(4000);
const t3=await text();
console.log('   [step 4]', t3.slice(0,300));
// Dues are asked for LAST, and that order is the argument: nobody is asked for
// money before they know what they are joining and what they are standing
// behind. If this ever moves earlier, this fails.
ok(/choose your membership/i.test(t3),'they are asked for dues only now, at the end');
ok(/agreed to the covenant/i.test(t3),'and told why they are being asked at this point');
ok(await js(`return document.querySelectorAll('.onb-tier').length>=3`),'the tiers are on screen, priced');
ok(/\$300/.test(t3)&&/for a month/i.test(t3),'each saying what it costs and how long it lasts in words');
ok((await call('GET','/onboarding',null,nova.token)).body.accepted===false,
   'and until one is taken the server still says they are not a member');
await shot('onb-5-tier.png');

console.log('\nAND ONLY THEN ARE THEY IN');
ok(await js(`const b=[...document.querySelectorAll('.onb-tier')].find(b=>/Monthly/.test(b.innerText));if(!b)return false;b.click();return true;`),
   'they take a membership');
await settle(4500);
const t4=await text();
console.log('   [in]', t4.slice(0,260));
ok(/my pass|my card/i.test(t4),'and the app opens');
ok((await call('GET','/onboarding',null,nova.token)).body.accepted===true,'the server agrees they are accepted');
await shot('onb-6-in.png');

console.log('\nTHE PASS IS WHAT THEY LAND ON');
const card=await text();
console.log('   [pass]', card.slice(0,420));
// Nothing may be stacked over the QR — see the note on MembershipScreen.
ok(!/your programme/i.test(card),'the programme picker is not stacked over the pass');
ok(await js(`const b=[...document.querySelectorAll('.mem-tab')].find(b=>(b.innerText||'').trim()==='Account');if(!b)return false;b.click();return true;`),
   'it is under Account');
await settle(1200);
const acct=await text();
ok(/your programme/i.test(acct),'where the card shows which one is theirs');
ok(/Housing stability/.test(acct),'by name');
await shot('prog-2-joined.png');

console.log('\nPLAYING IS NOT GIVING');
const potBefore=await js(`const e=document.querySelector('.prog-mine-num');return e?e.innerText:''`);
console.log('   [line]', potBefore);
ok(/\$0\.00 given/.test(potBefore),'they have given nothing yet');
await call('POST','/bingo/join',{},nova.token);
const cl=await call('POST','/bingo/entry/claim',{rail:'cash'},nova.token);
await call('POST','/bingo/entry/resolve',{id:cl.body.id,confirm:true},owner);
await cdp('Page.navigate',{url:appUrl});await settle(7000);
await tap('Enter');await settle(4000);
await toAccount();await settle(1500);
const potAfter=await js(`const e=document.querySelector('.prog-mine-num');return e?e.innerText:''`);
console.log('   [after playing]', potAfter);
ok(/\$0\.00 given/.test(potAfter),'paying to play still gives the programme nothing — it was not a donation');
const v0=(await call('GET','/world/reserve',null,owner)).body.byVault;
ok(!(v0.HOUSING_STABILITY>0),"and nothing landed in their programme's vault");

console.log('\nGIVING IS A SEPARATE, DELIBERATE ACT');
await toAccount();await settle(1200);
ok(await tap('Give to a cause'),'there is a way in from the card');
await settle(3000);
const g0=await text();
console.log('   [screen]', g0.slice(0,340));
ok(/gives a programme nothing and costs it nothing/i.test(g0),'and it says so plainly');
ok(await tap('Give'),'the Give tab is there');
await settle(1200);
ok(await js(`const b=[...document.querySelectorAll('.jub-kind')].find(b=>/Food & water/.test(b.innerText));if(!b)return false;b.click();return true;`),'a cause can be picked');
await type('#give-amt','25');
await settle(400);
await shot('prog-3-give.png');
ok(await tap('Give to this cause'),'and given');
await settle(3000);
const g1=await text();
console.log('   [after giving]', g1.slice(g1.indexOf('WHAT YOU HAVE GIVEN')>0?g1.indexOf('WHAT YOU HAVE GIVEN'):0,400));
ok(/pledged/i.test(g1),'it lands as a pledge, not as money');
ok(/\$25\.00/.test(g1),'for the amount they said');
const prog=(await call('GET','/programs',null,nova.token)).body.programs.find(p=>p.id==='FOOD');
ok(prog.donatedCents===0,'and the programme does not count it yet');

console.log('\nSOMEBODY ELSE CONFIRMS THE MONEY');
const don=(await call('GET','/programs/donations',null,nova.token)).body.donations[0];
ok((await call('POST','/programs/donation/settle',{donationId:don.donationId,received:true},nova.token)).status!==200,
   'the member cannot confirm their own');
ok((await call('POST','/programs/donation/settle',{donationId:don.donationId,received:true},owner)).status===200,
   'the house can');
await cdp('Page.navigate',{url:appUrl});await settle(7000);
await tap('Enter');await settle(3500);
await toAccount();await settle(1200);
await tap('Give to a cause');await settle(3000);
const g2=await text();
ok(/received/i.test(g2),'and the member sees it turn from pledged to received');
ok((await call('GET','/programs',null,nova.token)).body.programs.find(p=>p.id==='FOOD').donatedCents===2500,
   'only now does the programme count it');
await shot('prog-4-received.png');

console.log('\nASKING FOR A SEAT MEANS SAYING WHAT YOU BRING');
ok(await tap('Serve on a board'),'the other tab is there');
await settle(1500);
ok(await js(`const b=[...document.querySelectorAll('.jub-kind')].find(b=>/Food & water/.test(b.innerText));if(!b)return false;b.click();return true;`),'a programme can be picked');
await settle(1200);
const seats=await js(`return [...document.querySelectorAll('.seat-card strong')].map(e=>e.innerText.trim()).join(' | ')`);
console.log('   [seats]', seats);
ok(seats.split('|').length===5,'five seats on every board');
ok(/Treasurer/.test(seats)&&/Outreach/.test(seats),'named as jobs, not as ranks');
ok(await js(`return [...document.querySelectorAll('.seat-duty')].length===5`),'each says what the job actually is');
ok(await js(`const b=[...document.querySelectorAll('.seat-card')].find(b=>/Treasurer/.test(b.innerText));if(!b)return false;b.click();return true;`),'a seat can be chosen');
await settle(800);
// The apply button must refuse an empty statement — the seat is decided on it.
ok(await js(`const b=[...document.querySelectorAll('button')].find(b=>/Apply for this seat/i.test(b.innerText));return !!b&&b.disabled`),
   'you cannot apply having said nothing');
await type('#seat-brings','I keep the books for two churches on Tennessee Street and I can reconcile a pantry account every month.');
await settle(600);
await shot('prog-5-apply.png');
ok(await tap('Apply for this seat'),'with something to say, you can');
await settle(3000);
const a1=await text();
ok(/waiting on the board/i.test(a1),'and it is waiting on the board');
ok(/Treasurer/.test(a1),'for the seat they asked for');
await shot('prog-6-waiting.png');

console.log('\nTHE BOARD ANSWERS, BY NAME');
const q=(await call('GET','/board/queue',null,owner)).body.applications;
console.log('   [queue]', JSON.stringify(q.map(a=>({who:a.name,seat:a.positionLabel}))));
ok(q.length===1&&q[0].name==='Nova','the house sees the application');
ok((await call('POST','/board/decide',{applicationId:q[0].applicationId,approve:false},owner)).status===400,
   'declining with no reason is refused');
ok((await call('POST','/board/decide',{applicationId:q[0].applicationId,approve:true,note:'References checked.'},owner)).status===200,
   'approving seats them');
await cdp('Page.navigate',{url:appUrl});await settle(7000);
await tap('Enter');await settle(3500);
await toAccount();await settle(1200);
await tap('Give to a cause');await settle(3000);
const a2=await text();
console.log('   [seated]', a2.slice(0,300));
ok(/Treasurer/.test(a2)&&/Food & water/.test(a2),'the member now holds the seat, on their own screen');
await shot('prog-7-seated.png');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail?1:0);
