// Receipts, and the vault that proves them.
//
// §17: every supported platform transaction generates evidence REGARDLESS of
// payment method. That last part is the whole point — a cash payment at the
// door produces the same receipt shape as a card, because §42 keeps cash a
// first-class rail and a system that only proves the electronic half of its
// business cannot prove its business.
//
//     TRANSACTION → PRIVATE LEDGER → RECEIPT → PROOFVAULT → OPTIONAL ANCHOR
//
// The anchor is optional and OFF (§63). What is not optional is that somebody
// can later ask the questions SAPEMS asks in §44 — what happened, who
// authorized it, what evidence exists, what money was used, was it restricted,
// who received value — and get an answer out of this table.
import { randomBytes, createHash } from 'node:crypto';

/** §17's event list. */
export const RECEIPT_EVENTS = Object.freeze([
  'MEMBERSHIP', 'ACCESS', 'BOOKING', 'SERVICE', 'PERFORMANCE', 'PROJECT', 'PAYMENT',
  'STAKE', 'STAKE_RELEASE', 'BARTER', 'LICENSE', 'ROYALTY',
  'IP_REGISTRATION', 'RIGHTS_UPDATE', 'RESERVE_UPDATE',
]);
const EVENT_SET = new Set(RECEIPT_EVENTS);

/**
 * A receipt. `settled` is deliberate and load-bearing: §41 says show
 * "PENDING — NOT SETTLED" until actual settlement, so an unsettled receipt is
 * a real record of an unfinished thing rather than an optimistic one.
 */
export function makeReceipt({
  eventType, memberId = null, amount = null, rail = null,
  authorizedBy = null, restrictionStatus = 'open', delivered = null,
  reference = null, settled = false, at = Date.now(), meta = {},
} = {}) {
  if (!EVENT_SET.has(eventType)) throw new Error(`unknown receipt event: ${eventType}`);
  const body = {
    receiptId: `RCP-${randomBytes(6).toString('hex').toUpperCase()}`,
    eventType, memberId,
    amountUnits: amount ? amount.units : null,
    amountCurrency: amount ? amount.currency : null,
    amountLayer: amount ? amount.layer : null,
    rail,
    // SAPEMS §44 in four fields: who said yes, what money, was it somebody
    // else's, and what did the person actually get.
    authorizedBy, restrictionStatus, delivered, reference,
    settled, status: settled ? 'SETTLED' : 'PENDING — NOT SETTLED',
    at, meta,
  };
  return Object.freeze({ ...body, proofHash: hashReceipt(body) });
}

export function hashReceipt(body) {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/** Settling is a NEW receipt that points at the old one — never an edit. */
export function settleReceipt(receipt, { authorizedBy, delivered = null, at = Date.now() } = {}) {
  if (!authorizedBy) throw new Error('settlement must name who authorized it (§44)');
  return makeReceipt({
    eventType: receipt.eventType, memberId: receipt.memberId,
    amount: receipt.amountUnits == null ? null
      : { units: receipt.amountUnits, currency: receipt.amountCurrency, layer: receipt.amountLayer },
    rail: receipt.rail, authorizedBy,
    restrictionStatus: receipt.restrictionStatus,
    delivered: delivered ?? receipt.delivered,
    reference: receipt.reference, settled: true, at,
    meta: { ...receipt.meta, settles: receipt.receiptId, settlesProof: receipt.proofHash },
  });
}

/**
 * ProofVault (§45). Append-only by construction: there is no update and no
 * delete, because evidence you can edit is not evidence.
 */
export function proofVault(db) {
  return {
    put(receipt) {
      db.prepare(`INSERT OR IGNORE INTO proof_vault
        (receipt_id, event_type, member_id, amount_units, amount_currency, amount_layer,
         rail, authorized_by, restriction_status, delivered, reference, settled, at, meta, proof_hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(receipt.receiptId, receipt.eventType, receipt.memberId,
             receipt.amountUnits, receipt.amountCurrency, receipt.amountLayer,
             receipt.rail, receipt.authorizedBy, receipt.restrictionStatus,
             receipt.delivered, receipt.reference, receipt.settled ? 1 : 0,
             receipt.at, JSON.stringify(receipt.meta || {}), receipt.proofHash);
      return receipt;
    },
    get(receiptId) {
      const r = db.prepare('SELECT * FROM proof_vault WHERE receipt_id=?').get(receiptId);
      return r ? { ...r, settled: !!r.settled, meta: JSON.parse(r.meta || '{}') } : null;
    },
    forMember(memberId, limit = 50) {
      return db.prepare('SELECT * FROM proof_vault WHERE member_id=? ORDER BY at DESC LIMIT ?')
        .all(memberId, limit).map((r) => ({ ...r, settled: !!r.settled, meta: JSON.parse(r.meta || '{}') }));
    },
    /**
     * The whole vault, checked end to end.
     *
     * §45 is not satisfied by being able to verify a receipt somebody already
     * suspects. An after-action review asks whether ANYTHING was altered, and
     * that question has to be answerable without knowing what to look for.
     * Returns the first bad record rather than a bare false, because "something
     * is wrong somewhere" is not a finding anybody can act on.
     */
    verifyAll() {
      const ids = db.prepare('SELECT receipt_id FROM proof_vault ORDER BY at ASC').all();
      for (const { receipt_id: id } of ids) {
        const r = this.verify(id);
        if (!r.ok) return { ok: false, count: ids.length, failed: id, reason: r.reason };
      }
      return { ok: true, count: ids.length };
    },
    /** Does the stored copy still match its own fingerprint? */
    verify(receiptId) {
      if (!receiptId) return { ok: false, reason: 'verify() needs a receipt id — use verifyAll() to check the whole vault' };
      const r = this.get(receiptId);
      if (!r) return { ok: false, reason: 'no such receipt' };
      const body = {
        receiptId: r.receipt_id, eventType: r.event_type, memberId: r.member_id,
        amountUnits: r.amount_units, amountCurrency: r.amount_currency, amountLayer: r.amount_layer,
        rail: r.rail, authorizedBy: r.authorized_by, restrictionStatus: r.restriction_status,
        delivered: r.delivered, reference: r.reference, settled: r.settled,
        status: r.settled ? 'SETTLED' : 'PENDING — NOT SETTLED', at: r.at, meta: r.meta,
      };
      const again = hashReceipt(body);
      return again === r.proof_hash ? { ok: true } : { ok: false, reason: 'stored receipt does not match its proof hash' };
    },
  };
}
