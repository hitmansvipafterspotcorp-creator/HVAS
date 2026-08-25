// Adopted policy, and the difference between writing something down and it
// being in force.
//
// Every KODEX volume opens with the same warning in its own words: this does
// not become legally operative merely because it is printed, signed by an
// individual, uploaded to an application, or displayed at an event. Each entity
// must adopt it through the authority its own governing documents require.
//
// So a policy object here is inert until `adopt()` has been called with a named
// approver and a date. §47 wants every policy change auditable; §34 says actual
// governance policy must be explicitly adopted before activation. An
// un-adopted policy releases nothing — see releaseLimit() in world-reserve.
import { randomBytes } from 'node:crypto';
import { usd } from './money.mjs';

/** §47's ReserveAllocationPolicy. Draft by default — note `adopted: false`. */
export function draftAllocationPolicy({
  transactionType, paymentRail, platformFeePercent = 0, worldReservePercent = 0,
  minimum = usd(0), maximum = null, maxJubileeReleasePercent = 0,
  maximumSingleProgramRelease = null, minimumOperatingMonths = 0, minimumEmergencyReserve = usd(0),
} = {}) {
  return Object.freeze({
    policyId: `POL-${randomBytes(4).toString('hex').toUpperCase()}`,
    version: 1,
    transactionType, paymentRail,
    platformFeePercent, worldReservePercent,
    minimum, maximum,
    maxJubileeReleasePercent, maximumSingleProgramRelease,
    minimumOperatingMonths, minimumEmergencyReserve,
    adopted: false, approver: null, effectiveDate: null, active: false,
  });
}

/** Adoption is an event with a name on it. Anonymous adoption is not adoption. */
export function adopt(policy, { approver, effectiveDate = Date.now() } = {}) {
  if (!approver) throw new Error('a policy must be adopted BY someone — record the approver (§47)');
  return Object.freeze({ ...policy, adopted: true, active: true, approver, effectiveDate });
}

/** A change is a new version, never an edit. §47: every change auditable. */
export function amend(policy, changes, { approver, effectiveDate = Date.now() } = {}) {
  if (!approver) throw new Error('an amendment must name its approver (§47)');
  return Object.freeze({
    ...policy, ...changes,
    policyId: policy.policyId, version: policy.version + 1,
    adopted: true, active: true, approver, effectiveDate,
    supersedes: { version: policy.version, effectiveDate: policy.effectiveDate, approver: policy.approver },
  });
}

export function retire(policy, { approver, at = Date.now() } = {}) {
  if (!approver) throw new Error('retiring a policy must name its approver (§47)');
  return Object.freeze({ ...policy, active: false, retiredBy: approver, retiredAt: at });
}
