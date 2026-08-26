// The ways a member makes money here.
//
// Licensing covers creative work — a recording, a beat, an app. It does not
// cover most of the room. A chef does not license a plate of food, a nail tech
// does not license a set, and a promoter does not license the forty people she
// brought through the door. Building only licensing would have meant building
// for the artists and telling everybody else to wait.
//
// So there are three, and they are different on purpose:
//
//   SELL      — a service or goods, member to member. The venue takes a fee.
//   PARTNER   — a business runs something WITH the venue on an agreed split.
//   BRING     — somebody is paid for the people they bring, on money that
//               actually arrived.
//
// One rule runs through all three, and it is the same rule as everywhere else
// in this venue: nobody confirms their own money, and what is taken is said
// before it is taken (§46).

/** What somebody can put up for sale. */
export const LISTING_KINDS = Object.freeze({
  SERVICE: { label: 'A service', blurb: 'Work you do for somebody — a set, a cut, a shoot, a repair.' },
  GOODS: { label: 'Goods', blurb: 'Something you make or resell.' },
  FOOD: { label: 'Food & drink', blurb: 'A plate, a tray, a catering run.' },
  BOOKING: { label: 'A booking', blurb: 'Your time — a slot, a night, an appointment.' },
});

/** How the price works, because "$50" means different things to a DJ and a cook. */
export const PRICE_MODES = Object.freeze({
  FIXED: { label: 'Flat price', blurb: 'This is the price.' },
  FROM: { label: 'Starting at', blurb: 'Depends on the job — this is the floor.' },
  HOURLY: { label: 'Per hour', blurb: 'Charged by time.' },
  PER_HEAD: { label: 'Per person', blurb: 'Charged by headcount — catering, tables, groups.' },
});

/** Where it happens. A mobile nail tech and a venue residency are not the same. */
export const DELIVERY = Object.freeze({
  AT_VENUE: { label: 'At the venue' },
  AT_MINE: { label: 'At my place' },
  MOBILE: { label: 'I come to you' },
  DELIVERED: { label: 'Delivered' },
  PICKUP: { label: 'Pickup' },
  ONLINE: { label: 'Online' },
});

// ── Bookings, and the stake that makes them mean something (§18) ──────────
//
// §18 lays out the chain and ends with the line that decides the design:
//
//     Do not make staking only passive-yield speculation.
//
// So a stake here is not yield. It is a PERFORMANCE BOND — the thing that makes
// a booking a commitment instead of an intention. The real failure in a
// members' marketplace is not fraud, it is the nail tech who does not turn up
// and the client who books three and picks one. Both sides put something down,
// and the side that fails to show is the side that loses it.
//
// The chain is §18's, stage for stage:
//
//   BOOKING → AGREEMENT → DEPOSIT → STAKE → WORK → VERIFICATION
//           → PAYMENT RELEASE → STAKE RELEASE → RECEIPT
export const BOOKING_STAGES = Object.freeze([
  { id: 'REQUESTED', label: 'Asked for', who: 'client', blurb: 'Somebody has asked for the work.' },
  { id: 'AGREED', label: 'Agreed', who: 'provider', blurb: 'The provider has taken it, on these terms.' },
  { id: 'SECURED', label: 'Secured', who: 'house', blurb: 'Deposit in, stake posted. It is really booked.' },
  { id: 'WORKED', label: 'Work done', who: 'provider', blurb: 'The provider says they have done it.' },
  { id: 'VERIFIED', label: 'Confirmed', who: 'client', blurb: 'The client says they got it.' },
  { id: 'SETTLED', label: 'Paid out', who: 'house', blurb: 'Payment released, stake released, receipt written.' },
]);

export const BOOKING_STAGE = Object.freeze(
  Object.fromEntries(BOOKING_STAGES.map((s2, i) => [s2.id, { ...s2, order: i }])),
);

/** Where a booking can end badly, and who carries it. */
export const BOOKING_FAILURES = Object.freeze({
  PROVIDER_NO_SHOW: {
    label: 'The provider did not turn up',
    blurb: 'Their stake goes to the client, and the deposit comes back.',
  },
  CLIENT_NO_SHOW: {
    label: 'The client did not turn up',
    blurb: 'The provider keeps the deposit for the time they held, and gets their stake back.',
  },
  CANCELLED_EARLY: {
    label: 'Called off in time',
    blurb: 'Everything goes back where it came from. Nobody is punished for planning.',
  },
});

/** May this stage follow that one? Skipping a stage is how money moves early. */
export function bookingCanAdvance(from, to) {
  const a = BOOKING_STAGE[from]; const b = BOOKING_STAGE[to];
  if (!a || !b) return { ok: false, reason: `"${to}" is not a booking stage` };
  if (b.order !== a.order + 1) {
    return { ok: false, reason: `a booking goes ${a.label} → ${BOOKING_STAGES[a.order + 1]?.label || 'nowhere'}, not straight to ${b.label}` };
  }
  return { ok: true };
}

/**
 * Who ends up with what, once a booking is over.
 *
 * Written as one function so the good path and all three bad ones are decided in
 * the same place. A refund policy scattered across four endpoints is a refund
 * policy nobody can state.
 */
export function bookingOutcome({ priceCents, depositCents, stakeCents, feePercent, failure = null }) {
  const price = Math.floor(Number(priceCents) || 0);
  const deposit = Math.floor(Number(depositCents) || 0);
  const stake = Math.floor(Number(stakeCents) || 0);
  const rate = pct(feePercent);
  if (rate == null) return { ok: false, reason: 'the platform fee must be a rate between 0 and 1' };

  if (!failure) {
    const fee = Math.floor(price * rate);
    return {
      ok: true, outcome: 'SETTLED',
      toProvider: price - fee, toVenue: fee, toClient: 0,
      stakeReturned: stake, stakeForfeited: 0,
      // The deposit is part of the price, not on top of it. Charging a deposit
      // AND the full price afterwards is the oldest way to overcharge somebody.
      note: `Deposit of ${deposit} counted toward the price, not added to it.`,
    };
  }
  if (failure === 'PROVIDER_NO_SHOW') {
    return {
      ok: true, outcome: 'PROVIDER_NO_SHOW',
      toProvider: 0, toVenue: 0, toClient: deposit + stake,
      stakeReturned: 0, stakeForfeited: stake,
      note: 'The client gets their deposit back and the stake on top. The venue takes nothing from a night that did not happen.',
    };
  }
  if (failure === 'CLIENT_NO_SHOW') {
    const fee = Math.floor(deposit * rate);
    return {
      ok: true, outcome: 'CLIENT_NO_SHOW',
      toProvider: deposit - fee, toVenue: fee, toClient: 0,
      stakeReturned: stake, stakeForfeited: 0,
      note: 'The provider held the slot, so they keep the deposit. Their stake comes back — they were ready.',
    };
  }
  if (failure === 'CANCELLED_EARLY') {
    return {
      ok: true, outcome: 'CANCELLED_EARLY',
      toProvider: 0, toVenue: 0, toClient: deposit,
      stakeReturned: stake, stakeForfeited: 0,
      note: 'Called off in time. Everything goes back. Nobody is punished for planning ahead.',
    };
  }
  return { ok: false, reason: `"${failure}" is not one of the ways a booking fails` };
}

/**
 * A stake has to be worth staking.
 *
 * Too small and it is a rounding error somebody will happily forfeit; too large
 * and only people with money can take bookings, which quietly closes the
 * marketplace to exactly the people it is for.
 */
export function stakeFor({ priceCents, minCents = 500, maxCents = 10000, percent = 0.15 }) {
  const price = Math.floor(Number(priceCents) || 0);
  const want = Math.floor(price * percent);
  return Math.max(minCents, Math.min(maxCents, want));
}

/** How a business runs something with the venue rather than beside it. */
export const PARTNERSHIP_KINDS = Object.freeze({
  POPUP: { label: 'Pop-up', blurb: 'A night in the room — a kitchen, a bar, a stall.' },
  CATERING: { label: 'Catering', blurb: 'Feeding an event the venue is running.' },
  SUPPLY: { label: 'Supply', blurb: 'Providing stock the venue sells.' },
  RESIDENCY: { label: 'Residency', blurb: 'A standing slot — weekly, monthly.' },
  SPONSOR: { label: 'Sponsorship', blurb: 'A business backing a night or a programme.' },
});

/** What a referral is paid on. Never a signup — a signup is not money. */
export const REFERRAL_EVENTS = Object.freeze({
  MEMBERSHIP: { label: 'They bought a membership' },
  ENTRY: { label: 'They paid to play' },
  MARKET: { label: 'They bought from a member' },
});

const pct = (n) => {
  const v = Number(n);
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
};

/**
 * What the venue takes, and what the seller keeps.
 *
 * §46: no undisclosed deductions. This is computed the same way for the quote a
 * buyer is shown BEFORE they pay and for the money that actually moves, so the
 * two cannot drift — a fee that appears only at settlement is the thing that
 * ends trust in a marketplace.
 */
export function marketSplit({ priceCents, feePercent }) {
  const price = Math.floor(Number(priceCents));
  const rate = pct(feePercent);
  if (!Number.isFinite(price) || price < 0) return { ok: false, reason: 'a price must be a whole number of cents' };
  if (rate == null) return { ok: false, reason: 'the platform fee must be a rate between 0 and 1' };
  // Rounded DOWN, so the venue never takes a cent more than the stated rate.
  const fee = Math.floor(price * rate);
  return { ok: true, priceCents: price, feeCents: fee, sellerCents: price - fee, feePercent: rate };
}

/**
 * A partnership split, agreed by both sides before anything runs.
 *
 * Returns the refusal rather than clamping, because a split somebody did not
 * agree to is not a split — it is the venue deciding on its own.
 */
export function partnershipSplit({ grossCents, housePercent }) {
  const gross = Math.floor(Number(grossCents));
  const rate = pct(housePercent);
  if (!Number.isFinite(gross) || gross < 0) return { ok: false, reason: 'the take must be a whole number of cents' };
  if (rate == null) return { ok: false, reason: 'the house share must be a rate between 0 and 1' };
  const house = Math.floor(gross * rate);
  return { ok: true, grossCents: gross, houseCents: house, memberCents: gross - house, housePercent: rate };
}

/**
 * What somebody earns for bringing a person who then spent money.
 *
 * Paid on money that ARRIVED, never on a signup — otherwise the incentive is to
 * produce accounts rather than people, and a promoter who fills a room and a
 * promoter who fills a spreadsheet get paid the same.
 */
export function referralCommission({ grossCents, ratePercent, event }) {
  if (!REFERRAL_EVENTS[event]) return { ok: false, reason: `"${event}" is not something a referral is paid on` };
  const gross = Math.floor(Number(grossCents));
  const rate = pct(ratePercent);
  if (!Number.isFinite(gross) || gross <= 0) return { ok: false, reason: 'nothing was actually paid, so nothing is owed' };
  if (rate == null) return { ok: false, reason: 'the referral rate must be between 0 and 1' };
  return { ok: true, grossCents: gross, commissionCents: Math.floor(gross * rate), ratePercent: rate, event };
}

/**
 * A referral code somebody can say out loud.
 *
 * Derived from their name so a promoter can put it on a flyer and it still means
 * something, with digits to keep it unique. No I, O, 0 or 1 — this gets read
 * across a loud room at least as often as it gets typed.
 */
export function referralCodeFor(name, salt) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const D = '23456789';
  const base = String(name || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) || 'MEMBER';
  const n = Array.from(String(salt || '')).reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const pick = (set, shift) => set[((n >>> shift) % set.length + set.length) % set.length];
  return `${base}${pick(D, 0)}${pick(A, 3)}${pick(D, 7)}`;
}
