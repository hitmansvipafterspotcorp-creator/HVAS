// Three money layers, and they are never the same thing.
//
// §3 of the directive gives the whole rule in four words — "Do not collapse
// them" — and this module is that rule made structural rather than
// aspirational. An amount here always carries which LAYER it is in, and the
// arithmetic refuses to add across layers, so collapsing them is not a mistake
// somebody can make quietly six files from now.
//
//   FIAT   cash, card, bank, PayPal, ACH — settles OUTSIDE this system
//   HITK   the native platform currency — the transactional rail
//   WORLD  the ownerless commons reserve — preserve, protect, return, recover
//
// The reason this matters is not tidiness. §24 forbids representing WORLD as
// legal tender, and §10 forbids pretending 1 HITK = $1. Both of those become
// impossible the moment an amount cannot silently become "dollars".

export const LAYER = Object.freeze({ FIAT: 'FIAT', HITK: 'HITK', WORLD: 'WORLD' });

/** Payment rails, per §5. Cash stays a first-class rail — see §42. */
export const RAIL = Object.freeze({
  HITK: 'HITK',
  CASH: 'CASH',
  CARD: 'CARD',
  BANK: 'BANK',
  PAYPAL: 'PAYPAL',
  ZELLE: 'ZELLE',
  CASHAPP: 'CASHAPP',
});

/** Which layer a rail settles in. HITK is its own; everything else is fiat. */
export function railLayer(rail) {
  return rail === RAIL.HITK ? LAYER.HITK : LAYER.FIAT;
}

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * An amount, and what KIND of money it is.
 *
 * `units` is the smallest whole unit of that layer — cents for FIAT, whole
 * HITK for HITK, whole WORLD units for WORLD — because money held as a float
 * is money that eventually disagrees with itself by a penny in front of a
 * member.
 */
export function amount(layer, units, currency) {
  if (!LAYER[layer]) throw new Error(`unknown money layer: ${layer}`);
  if (!Number.isInteger(units)) throw new Error(`money must be whole units, got ${units}`);
  if (layer === LAYER.FIAT && !currency) throw new Error('fiat needs a currency');
  return Object.freeze({ layer, units, currency: layer === LAYER.FIAT ? currency : layer });
}

export const usd = (cents) => amount(LAYER.FIAT, cents, 'USD');
export const usdFromDollars = (dollars) => usd(Math.round(Number(dollars) * 100));
export const hitk = (units) => amount(LAYER.HITK, units);
export const world = (units) => amount(LAYER.WORLD, units);

function sameLayer(a, b, op) {
  if (a.layer !== b.layer || a.currency !== b.currency) {
    // The error names both sides on purpose: this is the failure the directive
    // is most worried about, and a stack trace that says "cannot add" without
    // saying WHAT was being added teaches nobody anything.
    throw new Error(`cannot ${op} ${a.currency} and ${b.currency} — these are different money layers (§3)`);
  }
}

export function add(a, b) { sameLayer(a, b, 'add'); return amount(a.layer, a.units + b.units, a.currency); }
export function sub(a, b) { sameLayer(a, b, 'subtract'); return amount(a.layer, a.units - b.units, a.currency); }

/** A share of an amount, rounded DOWN — never round money up in your own favour. */
export function share(a, fraction) {
  if (!isNum(fraction) || fraction < 0 || fraction > 1) throw new Error(`share must be 0..1, got ${fraction}`);
  return amount(a.layer, Math.floor(a.units * fraction), a.currency);
}

export const isZero = (a) => a.units === 0;
export const gte = (a, b) => { sameLayer(a, b, 'compare'); return a.units >= b.units; };

/** For screens and receipts. Never invents a conversion. */
export function formatAmount(a) {
  if (a.layer === LAYER.FIAT) {
    const sign = a.units < 0 ? '-' : '';
    const abs = Math.abs(a.units);
    return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  }
  return `${a.units.toLocaleString()} ${a.layer}`;
}
