// Jubilee: turning reserve capacity into something that actually happened to
// somebody.
//
// §31 draws the line this whole module exists to stay on the right side of:
//
//     Do not implement Jubilee as: database says debt = zero
//
// A record marking a debt cleared is not a debt cleared. Real support means a
// real economic action — rent paid to a landlord, a utility paid to the
// utility, equipment bought from a supplier. So an award here is not complete
// when it is approved; it is complete when a named provider confirms they
// received the money and delivered the thing.
//
// §32 rules out the other failure: never allocate by largest balance. Nothing
// in this file reads a token balance, and eligibility is program rules and
// verified need.
import { randomBytes } from 'node:crypto';
import { usd, formatAmount } from './money.mjs';
import { canRelease } from './world-reserve.mjs';
import { economyFlags } from './flags.mjs';

/** §37/§49/§50's programs, each bound to the vault that funds it. */
export const PROGRAMS = Object.freeze({
  EMERGENCY_FAMILY: { vault: 'EMERGENCY_FAMILY_STABILIZATION', label: 'Emergency family stabilization' },
  FOOD: { vault: 'FOOD_AND_WATER', label: 'Food & water' },
  HOUSING: { vault: 'HOUSING_STABILITY', label: 'Housing stability' },
  CREATOR: { vault: 'CREATOR_OPPORTUNITY', label: 'Creator recovery' },
  YOUTH: { vault: 'YOUTH_AND_EDUCATION', label: 'Youth & education' },
  SMALL_BUSINESS: { vault: 'WORKFORCE_SMALL_BUSINESS', label: 'Small business recovery' },
});

/**
 * Board positions, the same five on every programme.
 *
 * The same shape everywhere on purpose: a member who understands one board
 * understands all six, and a venue that invents a different structure per
 * programme ends up with six things nobody can compare or hold to account.
 *
 * Each says what the seat is actually FOR, because "Secretary" tells somebody
 * deciding whether to apply almost nothing about what they would be doing.
 */
export const BOARD_POSITIONS = Object.freeze([
  { id: 'CHAIR', label: 'Chair', duty: 'Runs the meetings and speaks for the programme.' },
  { id: 'TREASURER', label: 'Treasurer', duty: 'Watches the money in and the money out, and says so out loud.' },
  { id: 'SECRETARY', label: 'Secretary', duty: 'Keeps the record of what was decided and who decided it.' },
  { id: 'OUTREACH', label: 'Outreach', duty: 'Finds the people who need this and brings them in.' },
  { id: 'AT_LARGE', label: 'Member at large', duty: 'A seat with no portfolio and a full vote.' },
]);

export const BOARD_POSITION = Object.freeze(
  Object.fromEntries(BOARD_POSITIONS.map((p) => [p.id, p])),
);

/** §31's examples of what support actually IS. Each names a kind of provider. */
export const NEED_KINDS = Object.freeze({
  UTILITY: { program: 'EMERGENCY_FAMILY', providerKind: 'utility', label: 'Utility about to be cut off' },
  RENT: { program: 'HOUSING', providerKind: 'landlord', label: 'Rent or deposit' },
  LODGING: { program: 'EMERGENCY_FAMILY', providerKind: 'lodging', label: 'Emergency lodging' },
  FOOD: { program: 'FOOD', providerKind: 'food', label: 'Food' },
  TRANSPORT: { program: 'EMERGENCY_FAMILY', providerKind: 'transport', label: 'Transportation' },
  DOCUMENTS: { program: 'EMERGENCY_FAMILY', providerKind: 'admin', label: 'Critical documents' },
  EQUIPMENT: { program: 'CREATOR', providerKind: 'equipment', label: 'Replacement equipment' },
  TRAINING: { program: 'YOUTH', providerKind: 'training', label: 'Training or education' },
});

/** §68: classify before anything else. An unclassified need cannot be funded. */
export function classify(needKind) {
  const need = NEED_KINDS[needKind];
  if (!need) return { ok: false, reason: `"${needKind}" is not a program need — classify it before it can be funded (§68)` };
  return { ok: true, program: need.program, vault: PROGRAMS[need.program].vault, providerKind: need.providerKind, label: need.label };
}

/**
 * §68's gate, in order: classified → evidence verified → capacity checked →
 * approved → provider selected.
 *
 * Returns a decision with a reason on every path, including the yes. Book II's
 * Covenant Test wants leaders able to explain their authority; an approval
 * nobody can explain is the same problem as an unexplained refusal.
 */
export function assess({
  application, health, policy, vaultBalance, priorAwards = [], provider = null, now = Date.now(),
} = {}) {
  const cls = classify(application?.needKind);
  if (!cls.ok) return { ok: false, stage: 'CLASSIFY', reason: cls.reason };

  if (!application.evidenceVerified) {
    return { ok: false, stage: 'VERIFY', reason: 'the evidence for this need has not been verified yet' };
  }

  // §32 lists anti-fraud and prior assistance as eligibility factors. Two awards
  // for the same obligation is the failure that looks most like generosity.
  const dup = priorAwards.find((a) =>
    a.memberId === application.memberId && a.needKind === application.needKind &&
    a.status !== 'REJECTED' && (now - a.at) < 90 * 86400000);
  if (dup) {
    return { ok: false, stage: 'DUPLICATE', reason: `this member already received ${cls.label.toLowerCase()} support on ${new Date(dup.at).toDateString()} — check it is not the same obligation twice` };
  }

  if (!provider) {
    // §31: third-party obligations require actual settlement. §48: pay a local
    // verified provider, which helps the member AND the business.
    return { ok: false, stage: 'PROVIDER', reason: 'no approved provider selected — support is paid to the provider, never handed over as cash (§31)' };
  }
  if (provider.kind !== cls.providerKind) {
    return { ok: false, stage: 'PROVIDER', reason: `${provider.name} is a ${provider.kind} provider — this need pays a ${cls.providerKind}` };
  }
  if (!provider.approved) {
    return { ok: false, stage: 'PROVIDER', reason: `${provider.name} is not on the approved vendor roster (§38)` };
  }

  // A vault does not lend to another vault (§30).
  if (vaultBalance && application.amount.units > vaultBalance.units) {
    return { ok: false, stage: 'VAULT', reason: `${cls.vault} holds ${formatAmount(vaultBalance)} — vaults do not borrow from each other (§30)` };
  }

  const release = canRelease(application.amount, health, policy);
  if (!release.ok) return { ok: false, stage: 'CAPACITY', reason: release.reason };

  return { ok: true, stage: 'READY', program: cls.program, vault: cls.vault, reason: release.reason };
}

/**
 * §56's approvals. Normal releases need more hands than emergency ones, and an
 * emergency release is faster WITHOUT becoming unlimited — it carries a hard
 * cap and an expiry, and §55 means nobody can be two of the approvers.
 */
export function approvalsSatisfied({ approvals = [], emergency = false, amount, policy, now = Date.now() } = {}) {
  const names = new Set(approvals.map((a) => a.by).filter(Boolean));
  if (names.size !== approvals.length) {
    return { ok: false, reason: 'the same person cannot approve twice — that is one approval wearing two hats (§55)' };
  }
  const needed = emergency ? (policy?.emergencyApprovals ?? 2) : (policy?.normalApprovals ?? 3);
  if (names.size < needed) {
    return { ok: false, reason: `${names.size} of ${needed} approvals` };
  }
  if (emergency) {
    const cap = policy?.maximumEmergencyRelease;
    if (!cap) return { ok: false, reason: 'no adopted emergency limit — the fast path is faster, never unlimited (§56)' };
    if (amount.units > cap.units) return { ok: false, reason: `${formatAmount(amount)} is over the emergency limit of ${formatAmount(cap)}` };
    const expired = approvals.some((a) => now - a.at > (policy?.emergencyWindowMs ?? 24 * 3600000));
    if (expired) return { ok: false, reason: 'an emergency approval has expired — emergency authority does not keep (§56)' };
  }
  return { ok: true, reason: `${names.size} approvals${emergency ? ', emergency path' : ''}` };
}

/**
 * The award. Created only after assess() and approvalsSatisfied() both agree,
 * and it starts UNPAID — because §41 says show pending until settlement and
 * §31 says the money has to actually move.
 */
/** The one state an award may be paid from. */
export const AWARD_APPROVED = 'APPROVED — NOT YET PAID';

export function makeAward({ application, assessment, approvals, provider, emergency = false, at = Date.now() } = {}) {
  if (economyFlags().WORLD_AUTOMATIC_RELEASE) {
    // Defensive: the flag is off by design (§63). If somebody turns it on, this
    // is where they will find out that nothing here releases without a person.
    return { ok: false, reason: 'automatic release is not implemented — every release names its approvers (§55)' };
  }
  return {
    ok: true,
    award: Object.freeze({
      awardId: `JUB-${randomBytes(5).toString('hex').toUpperCase()}`,
      applicationId: application.applicationId,
      memberId: application.memberId,
      needKind: application.needKind,
      program: assessment.program, vault: assessment.vault,
      amount: application.amount,
      providerId: provider.providerId, providerName: provider.name,
      approvals: approvals.map((a) => ({ by: a.by, at: a.at })),
      emergency,
      status: AWARD_APPROVED,
      paidAt: null, deliveredAt: null, deliveryConfirmedBy: null,
      at,
    }),
  };
}

/** The money actually leaving, to the provider. Not to the member (§31). */
export function markPaid(award, { by, reference, at = Date.now() } = {}) {
  if (!by) return { ok: false, reason: 'a payment must name who released it' };
  if (!reference) return { ok: false, reason: 'a payment must carry the provider’s reference — otherwise nothing can be reconciled' };
  // Only an award that has not been paid can be paid. Without this an award
  // could be paid twice, each with its own reference, and the reserve would
  // report one commitment against two real payments — found by the §69 drill,
  // which is exactly the night it would have happened on.
  if (award?.status && award.status !== AWARD_APPROVED) {
    return { ok: false, reason: `that award is already ${award.status}` };
  }
  return { ok: true, award: Object.freeze({ ...award, status: 'PAID — AWAITING DELIVERY', paidAt: at, paidBy: by, paymentReference: reference }) };
}

/**
 * §68's last step before the receipt: the VENDOR confirms delivery. Until they
 * do, the venue has spent money and nobody has yet said the person got the
 * thing — which is exactly the gap where support becomes a line item.
 */
export function confirmDelivery(award, { by, what, at = Date.now() } = {}) {
  if (award.status !== 'PAID — AWAITING DELIVERY') return { ok: false, reason: 'only a paid award can be delivered' };
  if (!by || !what) return { ok: false, reason: 'delivery confirmation must name the provider and what was delivered' };
  return { ok: true, award: Object.freeze({ ...award, status: 'DELIVERED', deliveredAt: at, deliveryConfirmedBy: by, delivered: what }) };
}
