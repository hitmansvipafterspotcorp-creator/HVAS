// Whether money is allowed into the WORLD reserve.
//
// §28 sets the default and it is the strict one: for restricted money,
// WORLD_RESERVE_ELIGIBLE = FALSE. The KODEX says the same thing from the other
// direction — the Tallahassee portfolio warns in its own opening notice against
// converting restricted public or charitable funds, and Book II's
// CONTROLLING-PRINCIPLE NOTICE says that where a grant restriction outranks an
// internal document, the restriction governs and the conflict must be
// DOCUMENTED.
//
// So this service never returns a bare boolean. It returns a decision with a
// reason, because "no" without a reason cannot be reviewed, and the Covenant
// Test in Book II requires that records prove what happened and that leaders can
// explain their authority.

/** Sources §27 lists as potentially authorized. Still needs authorization. */
export const OPEN_SOURCES = Object.freeze([
  'unrestricted_donation', 'unrestricted_sponsorship', 'approved_platform_net_revenue',
  'approved_membership_allocation', 'marketplace_platform_fee', 'booking_platform_fee',
  'ip_registration_fee', 'mint_platform_fee', 'hitk_platform_fee', 'venue_contribution',
  'merchant_contribution', 'creator_contribution', 'fundraising_campaign',
  'approved_reserve_income', 'approved_commercial_surplus',
]);

/** §28's prohibited list. These are other people's money, or somebody's wages. */
export const RESTRICTED_SOURCES = Object.freeze([
  'restricted_government_grant', 'restricted_food_reimbursement', 'restricted_housing_assistance',
  'participant_deposit', 'payroll_tax', 'employee_wages', 'vendor_funds',
  'restricted_charitable_gift', 'restricted_youth_funds', 'restricted_emergency_funds',
]);

const OPEN = new Set(OPEN_SOURCES);
const RESTRICTED = new Set(RESTRICTED_SOURCES);

/**
 * Can this source go to the WORLD reserve?
 *
 * Three answers, never two:
 *   eligible     — an authorized open source
 *   restricted   — prohibited by default; only an explicit written authorization
 *                  under the controlling funding terms can override it
 *   unknown      — not on either list, which is ALSO a no. A source nobody has
 *                  classified is not a source anybody has approved.
 */
export function isEligible({ sourceType, authorization = null } = {}) {
  const type = String(sourceType || '').trim();

  if (RESTRICTED.has(type)) {
    if (authorization?.permitsWorldReserve === true && authorization.reference) {
      // §28's single exception: the controlling funding terms explicitly permit
      // the allocation. It has to name the document that says so.
      return {
        eligible: true,
        restriction: 'restricted',
        reason: `restricted source explicitly authorized by ${authorization.reference}`,
        authorizationId: authorization.reference,
      };
    }
    return {
      eligible: false,
      restriction: 'restricted',
      reason: `${type || 'this source'} is restricted money — it belongs to the program or person it was given for, not to the reserve`,
      authorizationId: null,
    };
  }

  if (OPEN.has(type)) {
    return { eligible: true, restriction: 'open', reason: `${type} is an authorized reserve source`, authorizationId: authorization?.reference || null };
  }

  return {
    eligible: false,
    restriction: 'unknown',
    reason: `${type || '(blank)'} has not been classified as a reserve source — classify it before it can be contributed`,
    authorizationId: null,
  };
}

export const getRestriction = (sourceType) =>
  (RESTRICTED.has(String(sourceType)) ? 'restricted' : OPEN.has(String(sourceType)) ? 'open' : 'unknown');
export const getAuthorization = (decision) => decision?.authorizationId || null;
