// The WORLD commons reserve: what is in it, where it sits, and how much of it
// may ever be released.
//
// NOBODY OWNS WORLD (§72). What this module tracks is therefore never
// ownership — it is CUSTODY (§22): real cash and real assets are held by a
// lawful custodian for an adopted purpose, and the registry records which
// custodian holds what and why. The protocol has no owner; the property has a
// keeper. Those are different sentences and the code keeps them different.
//
// Two rules do the heavy lifting here:
//   §30  balances do not silently move between vaults
//   §35  never distribute beyond available capacity
//
// Both are enforced rather than documented.
import { randomBytes, createHash } from 'node:crypto';
import { LAYER, usd, add, sub, share, formatAmount } from './money.mjs';
import { isEligible } from './world-eligibility.mjs';

/** §30's vault tree. A contribution lands in exactly one of these. */
export const VAULTS = Object.freeze([
  'CORE_RESILIENCE',
  'EMERGENCY_FAMILY_STABILIZATION',
  'FOOD_AND_WATER',
  'HOUSING_STABILITY',
  'CREATOR_OPPORTUNITY',
  'YOUTH_AND_EDUCATION',
  'WORKFORCE_SMALL_BUSINESS',
  'COMMUNITY_INFRASTRUCTURE',
  'FUTURE_GENERATIONS',
]);
const VAULT_SET = new Set(VAULTS);

/**
 * §29's contribution record. Every field is required because every field is
 * something somebody will eventually need to prove.
 *
 * Returns { ok, contribution } or { ok: false, refusal } — a refusal is a
 * RECORD, not a thrown error. Book II's Covenant Test requires that records
 * prove what happened; money being turned away is something that happened.
 */
export function makeContribution({
  sourceType, sourceEntity, sourceTransaction, amount: amt,
  assetType = 'CASH', vault, legalCustodian, beneficialPurpose,
  authorization = null, at = Date.now(),
} = {}) {
  const decision = isEligible({ sourceType, authorization });
  const base = {
    contributionId: `WRC-${randomBytes(5).toString('hex').toUpperCase()}`,
    sourceType, sourceEntity, sourceTransaction,
    amount: amt, currency: amt?.currency, assetType,
    vault, legalCustodian, beneficialPurpose,
    restrictionStatus: decision.restriction,
    authorizationId: decision.authorizationId,
    timestamp: at,
  };

  if (!decision.eligible) {
    return { ok: false, refusal: { ...base, refused: true, reason: decision.reason, proofHash: proofOf({ ...base, refused: true }) } };
  }
  if (!VAULT_SET.has(vault)) {
    return { ok: false, refusal: { ...base, refused: true, reason: `${vault || '(none)'} is not a WORLD vault`, proofHash: proofOf({ ...base, refused: true }) } };
  }
  if (!legalCustodian) {
    // §22: real assets cannot legally be held by "nobody". Something with no
    // named custodian is not in the reserve, it is unaccounted for.
    return { ok: false, refusal: { ...base, refused: true, reason: 'no legal custodian named — real assets cannot be held by nobody (§22)', proofHash: proofOf({ ...base, refused: true }) } };
  }
  if (!amt || amt.layer === undefined || amt.units <= 0) {
    return { ok: false, refusal: { ...base, refused: true, reason: 'a contribution must be a positive amount', proofHash: proofOf({ ...base, refused: true }) } };
  }

  return { ok: true, contribution: Object.freeze({ ...base, refused: false, reason: decision.reason, proofHash: proofOf(base) }) };
}

/** A stable fingerprint of the record, so a later copy can be checked against it. */
export function proofOf(record) {
  const canonical = JSON.stringify(record, Object.keys(record).sort());
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/**
 * §35's calculation, in the directive's own order:
 *
 *   actual reserve
 *   − restricted / unavailable
 *   − current commitments
 *   − protected operating floor
 *   − emergency minimum
 *   = available Jubilee capacity
 *
 * Floored at zero. A reserve that is over-committed has NO capacity — it does
 * not have negative capacity that some later addition quietly cancels out.
 */
export function reserveHealth({
  actualReserve, restricted, commitments, operatingFloor, emergencyMinimum,
} = {}) {
  const zero = usd(0);
  const a = actualReserve || zero;
  const parts = [restricted || zero, commitments || zero, operatingFloor || zero, emergencyMinimum || zero];
  let left = a;
  for (const p of parts) left = sub(left, p);
  const available = left.units > 0 ? left : usd(0);
  return {
    actualReserve: a,
    restricted: parts[0], commitments: parts[1],
    operatingFloor: parts[2], emergencyMinimum: parts[3],
    availableJubileeCapacity: available,
    overCommitted: left.units < 0,
  };
}

/**
 * §36's floor, as adopted POLICY rather than a constant. The directive is
 * explicit: do not hard-code permanent percentages, and policy must be
 * versioned — which in KODEX terms means it is not operative until it has been
 * adopted by someone with the authority to adopt it.
 */
export function releaseLimit(health, policy) {
  if (!policy?.adopted) {
    return { allowed: usd(0), reason: 'no adopted release policy — nothing can be released until one is adopted (§36)' };
  }
  const capacity = health.availableJubileeCapacity;
  const byPercent = share(capacity, policy.maxJubileeReleasePercent ?? 0);
  // An ABSENT single-award cap means there is no single-award cap. It does not
  // mean a cap of zero — which is what it used to mean, and a zero cap silently
  // blocked every release in a fully funded reserve while reporting "$0.00 of
  // $1350.00 available". A policy that genuinely intends to release nothing
  // should not be adopted at all.
  const cap = policy.maximumSingleProgramRelease;
  const capped = cap && cap.units > 0 && cap.units < byPercent.units;
  const allowed = capped ? cap : byPercent;
  return {
    allowed,
    reason: `${formatAmount(allowed)} of ${formatAmount(capacity)} available, under policy ${policy.policyId} v${policy.version}`,
  };
}

/** §35: never distribute beyond available capacity. Asked, never assumed. */
export function canRelease(requested, health, policy) {
  const limit = releaseLimit(health, policy);
  if (requested.layer !== LAYER.FIAT) return { ok: false, reason: 'releases settle in fiat to a real provider (§31)' };
  if (requested.units <= 0) return { ok: false, reason: 'a release must be a positive amount' };
  if (requested.units > limit.allowed.units) {
    return { ok: false, reason: `${formatAmount(requested)} exceeds what may be released — ${limit.reason}` };
  }
  return { ok: true, reason: limit.reason };
}

/** Vault balances, from contributions alone. Nothing moves between vaults. */
export function vaultBalances(contributions) {
  const out = Object.fromEntries(VAULTS.map((v) => [v, usd(0)]));
  for (const c of contributions) {
    if (c.refused || !VAULT_SET.has(c.vault)) continue;
    out[c.vault] = add(out[c.vault], c.amount);
  }
  return out;
}
