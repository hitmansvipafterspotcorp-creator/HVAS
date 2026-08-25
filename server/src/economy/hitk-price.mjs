// What a HITK is worth, and the refusal to pretend we know.
//
// §10 is blunt: never hard-code 1 HITK = $1 unless a real, legally supported
// redemption system exists. There isn't one, so this adapter's honest default
// is to have NO rate at all and to say so — a quote request simply fails rather
// than inventing a number that would end up on a member's receipt.
//
// When the venue does adopt a reference rate, it is a rate WITH PROVENANCE:
// where it came from, when it was set, and when it stops being usable. Every
// quote carries that, so a price on a receipt can always be traced back to the
// source that produced it.
import { randomBytes } from 'node:crypto';
import { LAYER, hitk } from './money.mjs';

/** §10's list, unchanged. INTERNAL_REFERENCE is the only one wired here. */
export const RATE_SOURCE = Object.freeze({
  INTERNAL_REFERENCE: 'INTERNAL_REFERENCE',
  DEX: 'DEX',
  ORACLE: 'ORACLE',
  APPROVED_EXCHANGE: 'APPROVED_EXCHANGE',
  MANUAL_REFERENCE: 'MANUAL_REFERENCE',
});

const QUOTE_TTL_MS = 10 * 60 * 1000;   // a price nobody refreshed is not a price

/**
 * The adopted reference rate, in fiat CENTS per one whole HITK.
 *
 * Unset means unset. It does not fall back to a hundred, or to one, or to
 * anything else convenient — see the note at the top of this file.
 */
export function hitkReferenceRate() {
  const raw = process.env.HITK_REFERENCE_CENTS_PER_HITK;
  if (raw == null || raw === '') return null;
  const cents = Number(raw);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return {
    centsPerHitk: cents,
    source: process.env.HITK_RATE_SOURCE || RATE_SOURCE.INTERNAL_REFERENCE,
    effectiveDate: process.env.HITK_RATE_EFFECTIVE_DATE || null,
  };
}

export const hitkPricingAvailable = () => hitkReferenceRate() !== null;

/**
 * Quote a fiat amount in HITK. §9: every quote carries quoteId, fiatAmount,
 * currency, hitkAmount, rateSource, createdAt, expiresAt.
 *
 * Throws when there is no adopted rate, because the alternative is a screen
 * telling somebody a price the venue never agreed to honour.
 */
export function quoteHitkFor(fiatAmount, now = Date.now()) {
  if (fiatAmount.layer !== LAYER.FIAT) throw new Error('can only quote HITK against a fiat amount');
  const rate = hitkReferenceRate();
  if (!rate) {
    throw new Error('no adopted HITK rate — HITK pricing is unavailable (§10: do not guarantee HITK USD value)');
  }
  // Round UP the HITK the member pays: rounding a price down would have the
  // venue quietly eating the remainder on every single transaction.
  const units = Math.ceil(fiatAmount.units / rate.centsPerHitk);
  return Object.freeze({
    quoteId: `Q-${randomBytes(5).toString('hex').toUpperCase()}`,
    fiatAmount,
    currency: fiatAmount.currency,
    hitkAmount: hitk(units),
    rateSource: rate.source,
    centsPerHitk: rate.centsPerHitk,
    rateEffectiveDate: rate.effectiveDate,
    createdAt: now,
    expiresAt: now + QUOTE_TTL_MS,
  });
}

export const quoteExpired = (q, now = Date.now()) => now > q.expiresAt;
