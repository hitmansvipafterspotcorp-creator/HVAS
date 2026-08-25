// A member's economic identity.
//
// §7: every legitimate member automatically receives one. No separate HITK
// signup, no duplicate account, no blockchain expertise required, and the
// operation must be IDEMPOTENT — activating a membership twice must not produce
// two identities, because the second one would be a second set of balances for
// the same person.
//
// The wallet already works this way (getOrCreateWallet in hitkoin.mjs, custodial,
// encrypted at rest, no seed phrase — which is §8 already satisfied). This links
// the rest of the identity around it.
import { createHash } from 'node:crypto';
import { getOrCreateWallet } from '../hitkoin.mjs';
import { economyFlags } from './flags.mjs';

/**
 * Derived, not stored, and derived from the member id — so calling this a
 * hundred times gives the same answer a hundred times without a table needing
 * to enforce it. That is what makes §7's idempotency structural.
 */
const derive = (prefix, memberId) =>
  `${prefix}-${createHash('sha256').update(`${prefix}:${memberId}`).digest('hex').slice(0, 16).toUpperCase()}`;

/**
 * Link (or re-link) a member's economic identity. Safe to call on every
 * membership activation, renewal and confirmation.
 *
 * Fails soft: if HITK accounts are switched off, or the wallet cannot be
 * created, the member still has a membership. HITKOIN is additive to a real
 * payment and must never be the reason somebody cannot get in.
 */
export function linkEconomicIdentity(db, walletKey, { memberId, membershipTier = null, membershipStatus = null } = {}) {
  if (!memberId) throw new Error('memberId required');
  const flags = economyFlags();
  const identity = {
    memberId,
    hitkAccountId: derive('HITK', memberId),
    proofVaultId: derive('PV', memberId),
    membershipTier, membershipStatus,
    walletProfile: null,
  };
  if (!flags.HITK_ENABLED || !flags.HITK_MEMBER_ACCOUNTS) return identity;
  try {
    const { address } = getOrCreateWallet(db, walletKey, memberId);
    identity.walletProfile = { custody: 'custodial', address, external: null };
  } catch {
    // No wallet today does not mean no identity — the ids above are still the
    // member's, and the wallet attaches the next time this is called.
    identity.walletProfile = { custody: 'custodial', address: null, external: null, pending: true };
  }
  return identity;
}

/**
 * §8's member-facing view. The seven lines a normal member should see, and
 * nothing that requires them to understand a blockchain.
 */
export function myHitk(db, memberId, walletSummaryFn) {
  const summary = walletSummaryFn ? walletSummaryFn(db, memberId) : { address: null, balance: '0', mints: [] };
  const received = summary.mints.filter((m) => m.status !== 'failed').reduce((n, m) => n + (m.amount || 0), 0);
  return {
    available: summary.balance,
    locked: '0', staked: '0', pending: '0',   // real once stakes land (§18)
    received: String(received), sent: '0',
    rewards: String(received),
    address: summary.address,
    // Said plainly, because §10 means a member must never be shown a dollar
    // value the venue has not actually adopted and cannot actually honour.
    note: 'HITK is a platform currency. It is not a promise of cash value.',
  };
}
