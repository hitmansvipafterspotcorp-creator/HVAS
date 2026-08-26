// Real end-to-end HitKoin test — runs the actual backend against a REAL
// local Ethereum-compatible chain (a `hardhat node` on 127.0.0.1:8545, no
// internet involved) with the real compiled+deployed HitKoin contract.
// Proves the full pipeline: payment confirms -> wallet auto-created ->
// on-chain mint transaction -> balance readable both from our own ledger
// AND independently straight off the chain.
//
// Requires: `cd blockchain && node deploy_local.mjs` output exported as
// HITKOIN_CONTRACT_ADDRESS / HITKOIN_MINTER_PRIVATE_KEY / HITKOIN_RPC_URL,
// and a `npx hardhat node` running in that same directory.
import { createApp } from './src/app.mjs';
import { onboard } from './test-helpers.mjs';
import { rmSync } from 'node:fs';
import { JsonRpcProvider, Contract, formatUnits } from 'ethers';

if (!process.env.HITKOIN_CONTRACT_ADDRESS || !process.env.HITKOIN_RPC_URL || !process.env.HITKOIN_MINTER_PRIVATE_KEY) {
  console.error('Set HITKOIN_CONTRACT_ADDRESS / HITKOIN_RPC_URL / HITKOIN_MINTER_PRIVATE_KEY first (see blockchain/deploy_local.mjs).');
  process.exit(1);
}

const dataDir = `/tmp/hvas-hitkoin-test-${Date.now()}`;
const { server } = createApp({ dataDir });
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const call = async (m, p, b, t) => {
  const res = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m); } };

console.log('SETUP: member signs up, staff logs in');
const start = await call('POST', '/auth/member/start', { contact: '850-555-8100' });
const verify = await call('POST', '/auth/member/verify', { contact: '850-555-8100', code: start.body.devCode, name: 'Draya' });
await onboard(call, verify.body.token);
const mtok = verify.body.token;
const staff = await call('POST', '/auth/staff', { code: 'DOOR850' });
const stok = staff.body.token;

const w0 = await call('GET', '/wallet', null, mtok);
ok(w0.body.enabled === true, 'venue reports HitKoin enabled (real contract configured)');
ok(w0.body.address === null, 'no wallet yet — nothing minted for this member so far');

console.log('\nMEMBER PAYS BY ZELLE, STAFF CONFIRMS -> should trigger a REAL on-chain mint');
const claim = await call('POST', '/pay/claim', { tier: 'Monthly', rail: 'zelle', reference: 'zelle-draya-1' }, mtok);
ok(claim.body.amount === 300, `claim filed for $${claim.body.amount} (Monthly)`);
const confirm = await call('POST', '/pay/confirm', { id: claim.body.id }, stok);
ok(confirm.body.ok && confirm.body.activated === 'Monthly', 'staff confirmed -> membership activated');

const w1 = await call('GET', '/wallet', null, mtok);
ok(!!w1.body.address, `wallet auto-created: ${w1.body.address}`);
ok(w1.body.mints.length === 1 && w1.body.mints[0].status === 'sent', 'mint ledger shows one SENT mint (real tx, not just queued)');
ok(!!w1.body.mints[0].txHash, `real transaction hash recorded: ${w1.body.mints[0].txHash}`);
const expectedAmount = 300 * 100; // $300 tier * default 100 HITK/$
ok(Number(w1.body.mints[0].amount) === expectedAmount, `minted amount matches $300 * 100 HITK/$ = ${expectedAmount} HITK`);
ok(Number(w1.body.balance) === expectedAmount, `wallet balance (our ledger) = ${w1.body.balance} HITK`);

console.log('\nINDEPENDENT CHECK: read the balance straight off the chain, bypassing our own backend entirely');
const provider = new JsonRpcProvider(process.env.HITKOIN_RPC_URL);
const token = new Contract(process.env.HITKOIN_CONTRACT_ADDRESS, ['function balanceOf(address) view returns (uint256)', 'function name() view returns (string)', 'function symbol() view returns (string)'], provider);
ok(await token.name() === 'HitKoin' && await token.symbol() === 'HITK', 'on-chain contract really is named HitKoin (HITK)');
const onChainBalance = await token.balanceOf(w1.body.address);
ok(Number(formatUnits(onChainBalance, 18)) === expectedAmount, `on-chain balanceOf() independently confirms ${formatUnits(onChainBalance, 18)} HITK — this is a REAL blockchain read, not our own claim`);

console.log('\nSECOND PAYMENT -> mints again, balance accumulates (not overwritten)');
const claim2 = await call('POST', '/pay/claim', { tier: 'Daily', rail: 'cash', reference: '' }, mtok);
await call('POST', '/pay/confirm', { id: claim2.body.id }, stok);
const w2 = await call('GET', '/wallet', null, mtok);
ok(w2.body.mints.length === 2, 'second mint recorded');
if (Number(w2.body.balance) !== expectedAmount + 20 * 100) console.log('DEBUG mints:', JSON.stringify(w2.body.mints, null, 2));
ok(Number(w2.body.balance) === expectedAmount + 20 * 100, `balance accumulated correctly: ${w2.body.balance} HITK`);

console.log(`\n${pass} passed, ${fail} failed`);
server.close();
try { rmSync(dataDir, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
