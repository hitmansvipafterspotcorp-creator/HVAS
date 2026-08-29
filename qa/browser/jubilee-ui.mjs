// Community support, driven the way a member and a host actually drive it.
//
// Every assertion here started as something that looked finished in the source
// and was broken in the browser:
//
//   1. The member's way into support was rendered inside HitKoinWidget, which
//      returns null unless the venue has HitKoin switched on. Support was
//      unreachable on every venue that had not enabled a different feature.
//   2. Every house-side call sent the MEMBER's token, three lines under a
//      comment saying the house side is refused if a member's token asks. The
//      queue answered "unauthorized" and the screen drew a $0.00 reserve.
//   3. An awarded case left the application queue with no way to record the
//      payment or the delivery, so the money could be approved and then never
//      finished by anyone.
//
// None of the three fails a build, a lint, or a server test. All three are the
// first thing you hit using the screens.
//
// It runs against a REAL backend with a REAL funded reserve, because the whole
// point of these screens is the arithmetic of somebody's rent.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
process.env.HVAS_HOST_CODE = 'HOST850'; process.env.HVAS_STAFF_CODE = 'DOOR850';
const { createApp } = await import(new URL('../../server/src/app.mjs', import.meta.url).href);
const { onboard } = await import(new URL('../../server/test-helpers.mjs', import.meta.url).href);
const { server: api } = createApp({ dataDir: `/tmp/hvas-jubui-${Date.now()}` });
await new Promise((r) => api.listen(0, r));
const API = `http://127.0.0.1:${api.address().port}`;
const call = async (m, p, b, t) => {
  const r = await fetch(API + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const mk = async (ph, nm) => {
  const s = await call('POST','/auth/member/start',{contact:ph});
  const v = (await call('POST','/auth/member/verify',{contact:ph,code:s.body.devCode,name:nm})).body;
  await onboard(call, v.token);   // signing in is not membership
  return v;
};
// A shared code can run the night but cannot approve money, so the two people
// who sign off here have to be real accounts — onboarded exactly the way the
// owner onboards them on a Saturday. Note the second hire goes through KENYA,
// not through the venue code: once the venue has an owner, the shared code
// cannot add anybody, which is the whole point of the owner existing.
const venueCode = (await call('POST','/auth/staff',{code:'HOST850'})).body.token;
const hire = async (name, role, by) => {
  const inv = await call('POST','/staff/invite',{ name, role }, by);
  if (!inv.body.code) throw new Error(`could not hire ${name}: ${JSON.stringify(inv.body)}`);
  return (await call('POST','/auth/staff/claim',{ code: inv.body.code })).body.token;
};
const host = await hire('Kenya','host', venueCode);   // the owner, made once
const door = await hire('Trey','staff', host);

// A funded reserve and an adopted policy, so the queue has something real.
await call('POST','/world/policy',{ maxReleasePercent:0.4, defaultVault:'HOUSING_STABILITY', normalApprovals:2 }, host);
await call('POST','/bingo/mode',{mode:'cash'},host);
await call('POST','/bingo/split',{housePercent:1,worldPercent:1},host);
for (let i=0;i<40;i++){ const m=await mk(`850-96${String(i).padStart(4,'0')}`,`P${i}`); await call('POST','/bingo/join',{},m.token);
  const cl=await call('POST','/bingo/entry/claim',{rail:'cash'},m.token); await call('POST','/bingo/entry/resolve',{id:cl.body.id,confirm:true},host); }
await call('POST','/jubilee/vendor',{name:'Sunrise Properties',kind:'landlord',contact:'850-555-0100'},host);
await call('POST','/jubilee/vendor',{name:'City Utilities',kind:'utility',contact:'850-555-0180'},host);
const nova = await mk('850-970-0001','Nova');
const rio = await mk('850-970-0002','Rio');
const rioApply = await call('POST','/jubilee/apply',{needKind:'RENT',amountCents:52000,detail:'Deposit on a new place after the fire.',providerHint:'Sunrise Properties'},rio.token);
if (rioApply.status !== 200) console.log('   [rio apply refused]', rioApply.status, JSON.stringify(rioApply.body).slice(0,200));
console.log('reserve cents:', (await call('GET','/world/reserve',null,host)).body.totalCents);

const APP=new URL('../../hitmans_vip_membership_app/dist', import.meta.url).pathname;
const SHOT=process.env.HVAS_SHOTS||'';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const web=createServer(async(q,s)=>{let p=decodeURIComponent(q.url.split('?')[0]).replace(/^\/HVAS/,'')||'/';if(p==='/'||!extname(p))p='/index.html';
  try{const b=await readFile(join(APP,normalize(p)));s.writeHead(200,{'Content-Type':T[extname(p)]||'application/octet-stream'});s.end(b);}catch{s.writeHead(404).end('no');}});
await new Promise(r=>web.listen(0,r));
const appUrl=`http://127.0.0.1:${web.address().port}/HVAS/`;
const CHROME = process.env.HVAS_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT=9466;
const WIDE = process.argv.includes('--wide');
const chrome=spawn(CHROME,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',`--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/cdp-jub-${Date.now()}`,WIDE?'--window-size=1280,900':'--window-size=430,932','about:blank'],{stdio:'ignore'});
let wsUrl=null;
for(let i=0;i<60&&!wsUrl;i++){try{const l=await(await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();const p=l.find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)wsUrl=p.webSocketDebuggerUrl;}catch{}if(!wsUrl)await new Promise(r=>setTimeout(r,300));}
const ws=new WebSocket(wsUrl);await new Promise(r=>ws.addEventListener('open',r));
let id=0;const w=new Map();const errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id&&w.has(m.id)){w.get(m.id)(m);w.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown'){const d=String(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text||'');if(!/ServiceWorker/i.test(d))errors.push(d.split('\n')[0].slice(0,140));}});
const cdp=(m,p={})=>new Promise(res=>{const i=++id;w.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await cdp('Runtime.enable');await cdp('Page.enable');
const js=async e=>(await cdp('Runtime.evaluate',{expression:`(()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const jsA=async e=>(await cdp('Runtime.evaluate',{expression:`(async()=>{${e}})()`,returnByValue:true,awaitPromise:true})).result?.result?.value;
const settle=ms=>new Promise(r=>setTimeout(r,ms));
const shot=async n=>{if(!SHOT)return;const r=await cdp('Page.captureScreenshot',{format:'png'});if(r.result?.data)await writeFile(join(SHOT,n),Buffer.from(r.result.data,'base64'));};
const tap=n=>js(`const t=${JSON.stringify(n)}.toLowerCase();const el=[...document.querySelectorAll('button')].find(b=>(b.innerText||'').toLowerCase().includes(t)&&!b.disabled&&b.offsetParent);if(!el)return false;el.click();return true;`);
const sel=(s)=>js(`const el=document.querySelector(${JSON.stringify(s)});if(!el)return false;el.click();return true;`);
const text=()=>js(`return (document.body.innerText||'').replace(/\\n+/g,' / ').slice(0,1400)`);
const type=(s,v)=>js(`const el=document.querySelector(${JSON.stringify(s)});if(!el)return false;
  const p=Object.getPrototypeOf(el);const d=Object.getOwnPropertyDescriptor(p,'value');d.set.call(el,${JSON.stringify(v)});
  el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
// Two cases sit in this queue at once, which is the honest shape of a busy
// night — so every host action has to name whose case it is acting on. An
// unscoped "click the Award button" is how the wrong person gets paid.
const inCase=(name,body)=>js(`const c=[...document.querySelectorAll('.jub-case')].find(c=>new RegExp(${JSON.stringify(name)}).test(c.innerText));if(!c)return 'no case';${body}`);
const caseText=n=>inCase(n,`return c.innerText.replace(/\\n+/g,' / ')`);
const caseTap=(n,label)=>inCase(n,`const b=[...c.querySelectorAll('button')].find(b=>new RegExp(${JSON.stringify(label)},'i').test(b.innerText)&&!b.disabled);if(!b)return false;b.click();return true;`);
const caseType=(n,v)=>inCase(n,`const el=c.querySelector('input');if(!el)return false;const p=Object.getPrototypeOf(el);Object.getOwnPropertyDescriptor(p,'value').set.call(el,${JSON.stringify(v)});el.dispatchEvent(new Event('input',{bubbles:true}));return true;`);
const casePick=(n,rx)=>inCase(n,`const s=c.querySelector('select');if(!s)return 'no select';const o=[...s.options].find(o=>new RegExp(${JSON.stringify(rx)}).test(o.text));if(!o)return 'no option';const p=Object.getPrototypeOf(s);Object.getOwnPropertyDescriptor(p,'value').set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return o.text;`);
const caseButtons=n=>inCase(n,`return [...c.querySelectorAll('button')].map(b=>b.innerText).join('|')`);
let pass=0,fail=0;
const ok=(c,m)=>{console.log(`  ${c?'PASS':'FAIL'}  ${m}`);c?pass++:fail++;};

await cdp('Page.navigate',{url:appUrl});await settle(2500);
await jsA(`if(navigator.serviceWorker){for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();}if(window.caches){for(const k of await caches.keys())await caches.delete(k);}return 1;`);
// A signed-in member with a live membership, pointed at this backend.
const now=Date.now();
await js(`localStorage.setItem('hvas_hub_off','1');
  localStorage.setItem('hvas_api_base',${JSON.stringify(API)});
  localStorage.setItem('hvas_api_token',${JSON.stringify(nova.token)});
  localStorage.setItem('hvas_api_member_id',${JSON.stringify(nova.member?.id||'')});
  localStorage.setItem('hvas_auth_v1',JSON.stringify({member:{name:'Nova',contact:'850-970-0001',since:${now}}}));
  localStorage.setItem('hvas_member_v1',JSON.stringify({tier:'Monthly',vip:false,number:${JSON.stringify(nova.member?.number||'HV-1111-2222')},payment:'card',paid:300,name:'Nova',contact:'850-970-0001',purchasedAt:${now},expiresAt:${now+30*86400000},status:'active',entries:2,loyalty:2,tickets:3,ticketsNight:'x',mealUsed:false}));
  return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(9000);

console.log('\nMEMBER — GETTING TO SUPPORT');
await tap('Enter');await settle(3000);
console.log('   [screen]', (await text()).slice(0,240));
ok(await tap('Account'),'the pass has an Account tab');
await settle(1500);
ok(await sel('.jub-entry'),'and a quiet way into support on it');
await settle(2500);
const form=await text();
console.log('   [form]',form.slice(0,700));
ok(/get help/i.test(form),'the support screen opens');
ok(/directly/i.test(form),'and says the venue pays the provider directly');
await shot('jub-1-member-form.png');

console.log('\nMEMBER — ASKING FOR HELP');
ok(await tap('Rent'),'a need kind can be picked');
await type('#jub-amt','200');
await type('#jub-detail','Landlord gave me until Friday. I have the rest, I am short 200.');
await type('#jub-prov','Sunrise Properties');
await settle(400);
await shot('jub-2-member-filled.png');
ok(await tap('Send this to the door'),'it can be sent');
await settle(3000);
const after=await text();
console.log('   [after]',after.slice(0,700));
ok(/pending|checking|door|review|waiting/i.test(after),'and it comes back as pending, not approved');
await shot('jub-3-member-sent.png');

console.log('\nHOST — THE QUEUE');
// The host phone signs in as a PERSON. A shared venue code runs the night but
// cannot approve money, so a suite about approving money on a host's phone has
// to be a host who exists. qa/browser/team.mjs covers the claim flow itself.
await js(`localStorage.setItem('hvas_api_staff_token',${JSON.stringify(host)});
  localStorage.setItem('hvas_api_staff_role','host');
  localStorage.setItem('hvas_api_staff_name','Kenya');
  localStorage.setItem('hvas_api_staff_named','1');return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(8000);
await tap('Enter');await settle(3000);
ok(await tap('PLAY LIP SYNC BINGO'),'the lobby opens');
await settle(3000);
console.log('   [lobby]',(await text()).slice(0,400));
ok(await tap('Host'),'host mode can be entered');
await settle(2500);
console.log('   [hostmode]',(await text()).slice(0,400));
await tap('Open Host Control');await settle(3500);
ok(await tap('Support'),'the host has a Support tab');
await settle(3000);
const q=await text();
console.log('   [queue]',q.slice(0,900));
ok(/reserve/i.test(q),'the reserve is on screen');
ok(/Nova/.test(q)&&/\$200\.00/.test(q),'the case is in the queue with its amount');
ok(/not checked/i.test(await caseText('Nova')),'and starts unchecked');
await shot('jub-4-host-queue.png');

console.log('\nHOST — VERIFY, APPROVE, AWARD');
await caseType('Nova','Called the landlord, balance confirmed.');
await settle(300);
await caseTap('Nova','Mark checked');
await settle(2500);
ok(/checked/i.test(await caseText('Nova')) && !/not checked/i.test(await caseText('Nova')),
   'it can be verified with a note');
await shot('jub-5-host-checked.png');
await caseTap('Nova','Approve as me');
await settle(2500);
const one=await caseText('Nova');
ok(/Kenya/.test(one),'and the approval carries a person\u2019s name, not "staff-device"');
console.log('   [after 1 approval]',one.slice(0,600));
ok(/1 of 2/i.test(one),'one approval is not two');
ok(!/Award/i.test(await caseButtons('Nova')),'and cannot be awarded on one approval');
await shot('jub-6-host-one-approval.png');

// The same identity tapping twice is still one person. If this counted, a
// two-approval rule would be a one-tap rule with extra steps.
await caseTap('Nova','Approve as me');await settle(2500);
ok(/1 of 2/i.test(await caseText('Nova')),'the same person approving twice is still one approval');
ok(!/Award/i.test(await caseButtons('Nova')),'and still cannot be awarded');

console.log('\nA SECOND, DIFFERENT APPROVER');
const appId = (await call('GET','/jubilee/queue',null,host)).body.applications?.find(a=>a.name==='Nova')?.applicationId;
console.log('   [approve via door]', (await call('POST','/jubilee/approve',{applicationId:appId},door)).status);
await settle(500);
await tap('Run');await settle(600);await tap('Support');await settle(3000);
const two = await caseText('Nova');
console.log('   [two approvals]', two.slice(0,600));
ok(/2 of 2/i.test(two),'two different people make two approvals');
const btns2 = await caseButtons('Nova');
console.log('   [buttons]', btns2);
ok(/Award/i.test(btns2),'and only now can it be awarded');
await shot('jub-7-host-two-approvals.png');

console.log('\nAWARDING IT');
const opt = await casePick('Nova','Sunrise');
console.log('   [provider]', opt);
ok(/Sunrise/.test(String(opt)),'a provider can be picked from the approved roster');
await settle(500);
await caseTap('Nova','Award');
await settle(3000);
await shot('jub-8-host-awarded.png');
const awarded = await text();
console.log('   [awarded]', awarded.slice(200,900));
// The click is not the outcome. What matters is what the SERVER now holds.
const srv = (await call('GET','/jubilee/queue',null,host)).body;
const novaCase = (srv.applications||[]).find(a=>a.name==='Nova');
console.log('   [server]', JSON.stringify({nova:novaCase?.status, awards:(srv.awards||[]).length}));
ok(!novaCase || novaCase.status !== 'SUBMITTED','the award actually landed on the server, not just on screen');
ok(/APPROVED|NOT YET PAID/i.test(awarded)||!/exceeds what may be released/i.test(awarded),
   'and no cap refusal for an amount inside the cap');

console.log('\nAND A CASE THE POLICY WILL NOT ALLOW');
// Rio asked for $520 against a $240 single-release cap. A refusal that does not
// say WHY, or which policy said so, is indistinguishable from a broken button.
const rioApp = (await call('GET','/jubilee/queue',null,host)).body.applications?.find(a=>a.name==='Rio');
if (rioApp) {
  await call('POST','/jubilee/verify',{applicationId:rioApp.applicationId,note:'Fire report seen.',verified:true},host);
  await call('POST','/jubilee/approve',{applicationId:rioApp.applicationId},host);
  await call('POST','/jubilee/approve',{applicationId:rioApp.applicationId},door);
  await tap('Run');await settle(600);await tap('Support');await settle(3000);
  console.log('   [pick]', await casePick('Rio','Sunrise'));
  await settle(400);
  await caseTap('Rio','Award');
  await settle(3000);
  const refused = await text();
  console.log('   [refusal]', refused.slice(200,600));
  ok(/exceeds what may be released/i.test(refused),'an over-cap award is refused, on screen');
  ok(/under policy POL-/i.test(refused),'and names the policy that refused it');
  await shot('jub-8b-host-refused.png');
}

console.log('\nPAYING IT, AND THE PROVIDER CONFIRMING');
await tap('Run');await settle(600);await tap('Support');await settle(3000);
// The innermost element that mentions it — an outer <section> matches too, and
// then "is it on screen" is answered by the whole page rather than the panel.
// The tightest element that both names the panel and holds its cases — the
// heading alone matches the text, and an outer <section> matches everything.
const owedPanel = `[...document.querySelectorAll('*')].filter(p=>/Owed and owing/i.test(p.innerText||'')&&p.querySelector('.jub-case')).pop()`;
const owed = await js(`const p=${owedPanel};return p?p.innerText.replace(/\\n+/g,' / ').slice(0,400):'no panel'`);
console.log('   [owed]', owed);
ok(/Owed and owing/i.test(owed)&&owed.length<400,'an approved award stays on screen until it is finished');
ok(/Nova/.test(owed)&&/\$200\.00/.test(owed),'with who it is for and how much');
await shot('jub-9-host-owed.png');

// PAID needs a reference. A payment nobody can reconcile is a claim, not a payment.
const payInputs = await js(`const c=[...document.querySelectorAll('.jub-case')].find(c=>/Nova/.test(c.innerText)&&/reference/i.test(c.innerHTML));
  if(!c)return 'no card';const el=c.querySelector('input');const p=Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(p,'value').set.call(el,'CHK-10421');el.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';`);
console.log('   [pay ref]', payInputs);
await settle(400);
await js(`const c=[...document.querySelectorAll('.jub-case')].find(c=>/Nova/.test(c.innerText));
  const b=[...c.querySelectorAll('button')].find(b=>/Mark paid/i.test(b.innerText)&&!b.disabled);if(b)b.click();return !!b;`);
await settle(3000);
const paid = (await call('GET','/jubilee/queue',null,host)).body.awards?.find(a=>a.name==='Nova');
console.log('   [server award]', JSON.stringify(paid));
ok(paid?.status?.includes('PAID')||paid?.paidAt,'the server records it as paid');
ok(paid?.reference==='CHK-10421','with the reference that was typed');
await shot('jub-10-host-paid.png');

// DELIVERED needs a person at the provider AND what they gave.
await js(`const c=[...document.querySelectorAll('.jub-case')].find(c=>/Nova/.test(c.innerText));
  const ins=[...c.querySelectorAll('input')];const set=(el,v)=>{const p=Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(ins[0],'D. Whitfield, Sunrise Properties');set(ins[1],'August rent credited to unit 4B');return 1;`);
await settle(400);
await js(`const c=[...document.querySelectorAll('.jub-case')].find(c=>/Nova/.test(c.innerText));
  const b=[...c.querySelectorAll('button')].find(b=>/Provider confirms/i.test(b.innerText)&&!b.disabled);if(b)b.click();return !!b;`);
await settle(3000);
const done = (await call('GET','/jubilee/mine',null,nova.token)).body.awards?.[0];
console.log('   [delivered]', JSON.stringify(done));
ok(done?.status==='DELIVERED','the provider confirming is what closes it');
ok(/unit 4B/.test(String(done?.delivered)),'and what they delivered is on the record');
const gone = await js(`const p=${owedPanel};return p?p.innerText:''`);
ok(!/Nova/.test(gone),'a finished award leaves the owing list');
await shot('jub-11-host-delivered.png');

console.log('\nWHAT THE MEMBER SEES NOW');
await js(`localStorage.removeItem('hvas_api_staff_token');return 1;`);
await cdp('Page.navigate',{url:appUrl});await settle(8000);
await tap('Enter');await settle(3000);
await tap('Account');await settle(1500);
await sel('.jub-entry');await settle(3000);
const mine = await text();
console.log('   [member]', mine.slice(0,900));
ok(/delivered|confirmed/i.test(mine),'the member sees it delivered, confirmed by the provider');
ok(/unit 4B/.test(mine),'and what the provider says they handed over');
ok(/Sunrise Properties/.test(mine),'and who the money is going to');
await shot('jub-9-member-approved.png');

console.log('\nPAGE ERRORS');
console.log(errors.length?errors.join('\n'):'  none');
ok(errors.length===0,'no page errors');
console.log(`\n${pass} passed, ${fail} failed`);
ws.close();chrome.kill();web.close();api.close();
process.exit(fail ? 1 : 0);
