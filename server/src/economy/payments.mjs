// One checkout for the whole platform.
//
// §5 ends with the rule this file exists to obey:
//
//     Do not create completely different checkout systems for each HVAS feature.
//
// Which this codebase was already breaking. Memberships settle through the
// `payments` table with a claim → host-confirm flow; the Lip Sync Bingo entry
// fee grew its OWN claim → host-confirm flow a day later, with its own table,
// its own endpoints and its own idea of what "pending" means. Two checkouts
// that agree today are two checkouts that disagree in six months, and the
// disagreement is about money.
//
// So this is the shared service. It does not delete either existing flow —
// §1 forbids ripping out working code, and both of those are working — it
// gives them one set of definitions to share, and every new thing that charges
// for anything goes through here instead of growing a third.
//
// The invariant that outranks all of it: a member can ASK to pay. Only the
// house can say a payment happened. That is enforced at the call site of
// settlePayment(), not left to whoever writes the next endpoint.
import { randomBytes } from 'node:crypto';
import { RAIL, railLayer, LAYER, usd, formatAmount } from './money.mjs';
import { quoteHitkFor, hitkPricingAvailable, quoteExpired } from './hitk-price.mjs';
import { makeReceipt, settleReceipt } from './receipts.mjs';
import { economyFlags } from './flags.mjs';

/** §12's classifications — what is being bought decides how it is proved. */
export const ITEM_CLASS = Object.freeze({
  MEMBERSHIP: 'MEMBERSHIP', ACCESS: 'ACCESS', SERVICE: 'SERVICE',
  PERFORMANCE: 'PERFORMANCE', VENUE_BOOKING: 'VENUE_BOOKING', LICENSE: 'LICENSE',
  IP_ASSET: 'IP_ASSET', PROJECT: 'PROJECT', COLLECTIBLE: 'COLLECTIBLE', CONTRACT: 'CONTRACT',
});

/** §9's pricing modes. MULTI_RAIL is the default. */
export const PRICING_MODE = Object.freeze({
  MULTI_RAIL: 'MULTI_RAIL', HITK_ONLY: 'HITK_ONLY', FIAT_ONLY: 'FIAT_ONLY',
  FIXED_HITK: 'FIXED_HITK', DYNAMIC_HITK_QUOTE: 'DYNAMIC_HITK_QUOTE',
});

const RECEIPT_FOR = {
  MEMBERSHIP: 'MEMBERSHIP', ACCESS: 'ACCESS', SERVICE: 'SERVICE',
  PERFORMANCE: 'PERFORMANCE', VENUE_BOOKING: 'BOOKING', LICENSE: 'LICENSE',
  IP_ASSET: 'IP_REGISTRATION', PROJECT: 'PROJECT', COLLECTIBLE: 'ACCESS', CONTRACT: 'PROJECT',
};

/**
 * What a thing costs and how it may be paid for. §9: an item may carry a fiat
 * price, a HITK price, and the rails it accepts.
 */
export function priceItem({ itemClass, fiatPrice, hitkPrice = null, mode = PRICING_MODE.MULTI_RAIL, acceptedRails = null } = {}) {
  if (!ITEM_CLASS[itemClass]) throw new Error(`unknown item class: ${itemClass}`);
  const flags = economyFlags();
  let rails = acceptedRails || [RAIL.CASH, RAIL.CARD, RAIL.BANK, RAIL.PAYPAL, RAIL.ZELLE, RAIL.CASHAPP, RAIL.HITK];
  if (mode === PRICING_MODE.FIAT_ONLY) rails = rails.filter((r) => r !== RAIL.HITK);
  if (mode === PRICING_MODE.HITK_ONLY) rails = [RAIL.HITK];
  // HITK cannot be offered when nothing can price it — see hitk-price.mjs.
  if (!flags.HITK_ENABLED || !hitkPricingAvailable()) {
    if (!hitkPrice) rails = rails.filter((r) => r !== RAIL.HITK);
  }
  return Object.freeze({ itemClass, fiatPrice, hitkPrice, mode, acceptedRails: Object.freeze(rails) });
}

/** §5 quotePayment(). Fiat is itself; HITK is quoted, with provenance. */
export function quotePayment(priced, rail, now = Date.now()) {
  if (!priced.acceptedRails.includes(rail)) {
    return { ok: false, reason: `${rail} is not accepted for this ${priced.itemClass}` };
  }
  if (rail !== RAIL.HITK) return { ok: true, rail, layer: LAYER.FIAT, amount: priced.fiatPrice, quote: null };
  if (priced.hitkPrice) return { ok: true, rail, layer: LAYER.HITK, amount: priced.hitkPrice, quote: null };
  try {
    const q = quoteHitkFor(priced.fiatPrice, now);
    return { ok: true, rail, layer: LAYER.HITK, amount: q.hitkAmount, quote: q };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
}

/** §5 selectRail(): what a member may actually choose right now. */
export const selectRail = (priced) => priced.acceptedRails.slice();

/**
 * §5 createPayment(). This is a REQUEST. It settles nothing, and it is the only
 * thing a member's own token is ever allowed to do.
 */
export function createPayment({ priced, rail, memberId, reference = null, now = Date.now() } = {}) {
  const q = quotePayment(priced, rail, now);
  if (!q.ok) return { ok: false, reason: q.reason };
  if (q.quote && quoteExpired(q.quote, now)) return { ok: false, reason: 'that quote expired — ask for a new one' };
  const payment = Object.freeze({
    paymentId: `PAY-${randomBytes(5).toString('hex').toUpperCase()}`,
    itemClass: priced.itemClass, memberId, rail, layer: railLayer(rail),
    amount: q.amount, quoteId: q.quote?.quoteId || null,
    rateSource: q.quote?.rateSource || null,
    reference, status: 'PENDING', createdAt: now,
  });
  // §41: pending is shown as pending, in those words, until it is not.
  const receipt = makeReceipt({
    eventType: RECEIPT_FOR[priced.itemClass] || 'PAYMENT',
    memberId, amount: q.amount, rail, reference,
    settled: false, at: now, meta: { paymentId: payment.paymentId, quoteId: payment.quoteId },
  });
  return { ok: true, payment, receipt };
}

/**
 * §5 verifyPayment(). Who is allowed to say money arrived.
 *
 * A processor webhook counts because the processor verified it. A member does
 * NOT count, ever, about their own payment — that is the single rule the whole
 * pot rests on, and it lives here so no future endpoint has to remember it.
 */
export function verifyPayment({ payment, verifier } = {}) {
  if (!verifier || !verifier.role) return { ok: false, reason: 'unverified' };
  if (verifier.role === 'member') {
    return { ok: false, reason: 'a member cannot verify their own payment — the house confirms it' };
  }
  if (!['staff', 'host', 'processor', 'chain'].includes(verifier.role)) {
    return { ok: false, reason: `${verifier.role} may not verify payments` };
  }
  if (verifier.role === 'chain' && !economyFlags().HITK_REAL_CHAIN) {
    return { ok: false, reason: 'no chain is enabled — a chain cannot have confirmed anything (§63)' };
  }
  return { ok: true, by: verifier.id || verifier.role };
}

/** §5 settlePayment(). Only after verifyPayment agrees. */
export function settlePayment({ payment, receipt, verifier, delivered = null, now = Date.now() } = {}) {
  const v = verifyPayment({ payment, verifier });
  if (!v.ok) return { ok: false, reason: v.reason };
  const settled = Object.freeze({ ...payment, status: 'SETTLED', settledAt: now, settledBy: v.by });
  return { ok: true, payment: settled, receipt: settleReceipt(receipt, { authorizedBy: v.by, delivered, at: now }) };
}

/** §5 recordApprovedCashPayment(). Cash is a rail, not an exception (§42). */
export function recordApprovedCashPayment({ priced, memberId, verifier, reference = null, now = Date.now() } = {}) {
  const created = createPayment({ priced, rail: RAIL.CASH, memberId, reference, now });
  if (!created.ok) return created;
  return settlePayment({ ...created, verifier, delivered: 'cash taken at the door', now });
}

/** §5 refundPayment(). A refund is its own record, pointing at the original. */
export function refundPayment({ payment, receipt, verifier, reason, now = Date.now() } = {}) {
  const v = verifyPayment({ payment, verifier });
  if (!v.ok) return { ok: false, reason: v.reason };
  if (!reason) return { ok: false, reason: 'a refund must say why' };
  return {
    ok: true,
    payment: Object.freeze({ ...payment, status: 'REFUNDED', refundedAt: now, refundedBy: v.by, refundReason: reason }),
    receipt: makeReceipt({
      eventType: 'PAYMENT', memberId: payment.memberId,
      amount: payment.amount, rail: payment.rail, authorizedBy: v.by,
      delivered: `refund: ${reason}`, reference: payment.reference, settled: true, at: now,
      meta: { refunds: payment.paymentId, originalReceipt: receipt?.receiptId || null },
    }),
  };
}

export const getReceipt = (vault, receiptId) => vault.get(receiptId);
export { formatAmount, usd };
