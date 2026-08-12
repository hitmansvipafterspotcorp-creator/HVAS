// HitKoin — member reward token. Mints automatically the moment a real
// payment confirms (PayPal webhook verified, or staff confirms a Zelle/cash
// claim), same trigger points that already activate a membership.
//
// Custodial by design: each member gets a wallet generated server-side (no
// seed phrase, no wallet app to install) — same "no extra work for the
// member" philosophy as OTP sign-in and the rolling QR pass. The private
// key is encrypted at rest with a key that never leaves this device (same
// seal/open primitive already used for venue secrets).
//
// Fails soft everywhere: if HitKoin isn't configured, or the chain call
// errors, the payment still activates the membership. HitKoin is a bonus
// on top of a real payment, never a blocker to one.
import { Wallet, Contract, JsonRpcProvider, NonceManager, parseUnits, formatUnits } from 'ethers';
import { seal, open } from './crypto.mjs';

const HITKOIN_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address owner) view returns (uint256)',
];

export function hitkoinEnabled() {
  return !!(process.env.HITKOIN_CONTRACT_ADDRESS && process.env.HITKOIN_RPC_URL && process.env.HITKOIN_MINTER_PRIVATE_KEY);
}
export function hitkoinPerDollar() {
  return Number(process.env.HITKOIN_PER_DOLLAR || 100);
}

// Generates (once) or loads a member's custodial wallet.
export function getOrCreateWallet(db, walletKey, memberId) {
  const row = db.prepare('SELECT * FROM wallets WHERE member_id=?').get(memberId);
  if (row) return { address: row.address };
  const w = Wallet.createRandom();
  const enc = seal(walletKey, { privateKey: w.privateKey });
  db.prepare('INSERT INTO wallets(member_id, address, enc_privkey, created_at) VALUES(?,?,?,?)')
    .run(memberId, w.address, enc, Date.now());
  return { address: w.address };
}

// The venue's minter wallet signs from one address for every member, so two
// payments confirmed close together (two staff at once, or a busy door)
// must never race for the same on-chain nonce — wrap it in ethers' own
// NonceManager, built exactly for "one wallet, many sequential sends".
let contractCache = null;
function minterContract() {
  if (contractCache) return contractCache;
  const provider = new JsonRpcProvider(process.env.HITKOIN_RPC_URL);
  const minter = new NonceManager(new Wallet(process.env.HITKOIN_MINTER_PRIVATE_KEY, provider));
  contractCache = new Contract(process.env.HITKOIN_CONTRACT_ADDRESS, HITKOIN_ABI, minter);
  return contractCache;
}

// Mint HitKoin for a real, verified payment. `reason` is the rail that paid
// (paypal | zelle | cash | other) — purely for the member's own mint history.
export async function mintForPayment(db, walletKey, { memberId, usdAmount, reason }) {
  if (!hitkoinEnabled() || !(usdAmount > 0)) return null;
  const amountTokens = usdAmount * hitkoinPerDollar();
  const { address } = getOrCreateWallet(db, walletKey, memberId);
  const amountWei = parseUnits(String(amountTokens), 18);
  const id = `HK-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  db.prepare('INSERT INTO hitkoin_mints(id,member_id,amount_wei,usd_amount,reason,status,at) VALUES(?,?,?,?,?,?,?)')
    .run(id, memberId, amountWei.toString(), usdAmount, reason, 'pending', Date.now());
  try {
    const tx = await minterContract().mint(address, amountWei);
    db.prepare('UPDATE hitkoin_mints SET status=?, tx_hash=? WHERE id=?').run('sent', tx.hash, id);
    return { id, address, amountTokens, txHash: tx.hash };
  } catch (e) {
    db.prepare('UPDATE hitkoin_mints SET status=?, error=? WHERE id=?').run('failed', String(e.message || e).slice(0, 300), id);
    return { id, address, amountTokens, error: true };
  }
}

// Member-facing summary: wallet address + running balance (from this
// venue's own mint ledger — the record of what we told the chain to do,
// which is what a member actually cares about seeing) + recent history.
export function walletSummary(db, memberId) {
  const w = db.prepare('SELECT address, created_at FROM wallets WHERE member_id=?').get(memberId);
  if (!w) return { address: null, balance: '0', mints: [] };
  const rows = db.prepare('SELECT * FROM hitkoin_mints WHERE member_id=? ORDER BY at DESC LIMIT 50').all(memberId);
  const balanceWei = rows.filter((r) => r.status !== 'failed').reduce((sum, r) => sum + BigInt(r.amount_wei), 0n);
  return {
    address: w.address,
    balance: formatUnits(balanceWei, 18),
    mints: rows.map((r) => ({ id: r.id, amount: r.usd_amount * hitkoinPerDollar(), usdAmount: r.usd_amount, reason: r.reason, status: r.status, txHash: r.tx_hash, error: r.error, at: r.at })),
  };
}
