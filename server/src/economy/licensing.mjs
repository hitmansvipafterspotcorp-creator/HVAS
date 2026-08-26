// Licensing: a creator selling the right to use their own work.
//
// The registry already proves WHO made a thing and WHEN — a SHA-256 of the take,
// registered without the file ever leaving their phone. This is the other half:
// turning that proof into something they can sell, more than once, to more than
// one buyer, without losing it.
//
// The design rule underneath all of it: A LICENCE IS A GRANT, NOT A SALE OF THE
// WORK. The creator keeps ownership every time. That is what makes it possible
// to license the same recording for a film, a T-shirt and a remix and still own
// it afterwards — and it is the exact opposite of the buyout an unsigned artist
// is usually offered.

import { randomBytes } from 'node:crypto';

/**
 * The licence types, each saying what it actually permits in the words a
 * creator would use — not the words a contract would.
 *
 * `exclusive` means this type CAN be sold exclusively. `conflicts` names the
 * types an exclusive grant blocks, because selling an exclusive sync licence and
 * then a second sync licence is the one mistake that ends in court.
 */
export const LICENSE_TYPES = Object.freeze({
  SYNC: {
    label: 'Sync — film, TV, ads, video',
    grants: 'Use the recording behind moving picture.',
    exclusive: true, conflicts: ['SYNC'],
  },
  MASTER: {
    label: 'Master use — this exact recording',
    grants: 'Use this specific recording, as recorded.',
    exclusive: true, conflicts: ['MASTER', 'SYNC'],
  },
  PERFORMANCE: {
    label: 'Performance — play it in a venue or at an event',
    grants: 'Play it publicly at a named venue, event or broadcast.',
    exclusive: false, conflicts: [],
  },
  SAMPLE: {
    label: 'Sample — use a piece in a new work',
    grants: 'Take a portion and build something else on it.',
    exclusive: false, conflicts: [],
  },
  REMIX: {
    label: 'Remix — make a new version',
    grants: 'Rework the whole thing into a new version, credited to you.',
    exclusive: true, conflicts: ['REMIX'],
  },
  MERCH: {
    label: 'Print & merch — put it on goods',
    grants: 'Reproduce the artwork, name or likeness on physical goods.',
    exclusive: true, conflicts: ['MERCH'],
  },
  MECHANICAL: {
    label: 'Copies — press, stream, distribute',
    grants: 'Reproduce and distribute copies, physical or streamed.',
    exclusive: false, conflicts: [],
  },
  STOCK: {
    label: 'Stock — anybody, any project',
    grants: 'A standing, non-exclusive licence anybody can buy off the shelf.',
    exclusive: false, conflicts: [],
  },
  // Its own type, deliberately. In August 2026 the major labels are licensing
  // catalogue INTO model training; an independent creator's answer to that
  // question should be theirs to give or withhold, priced by them, and never
  // bundled inside a licence somebody bought for something else.
  AI_TRAINING: {
    label: 'AI training — train a model on this',
    grants: 'Use this work as training data for a machine-learning model.',
    exclusive: false, conflicts: [],
    // The one type that is never implied by any other, and never on by default.
    neverImplied: true,
  },
  BUYOUT: {
    label: 'Full buyout — every right, exclusively',
    grants: 'Everything above, exclusively, for the term. The creator still owns the work.',
    exclusive: true,
    conflicts: ['SYNC', 'MASTER', 'PERFORMANCE', 'SAMPLE', 'REMIX', 'MERCH', 'MECHANICAL', 'STOCK'],
  },
});

export const LICENSE_TYPE_LIST = Object.freeze(
  Object.entries(LICENSE_TYPES).map(([id, t]) => ({ id, ...t })),
);

/**
 * What KIND of thing is being licensed.
 *
 * The registry began as performances, because that is what a lip sync night
 * produces. But the trade list is 65 deep — designers, photographers, writers,
 * web people — and an app somebody builds is as licensable as a verse somebody
 * sings. Restricting this to recordings would have quietly told most of the
 * room that their work does not count as work.
 *
 * Every kind carries the same proof: a SHA-256 computed on the creator's own
 * device. The file never moves.
 */
export const WORK_KINDS = Object.freeze({
  PERFORMANCE: { label: 'Performance', blurb: 'A take from a night — lip sync, live set, a verse.' },
  RECORDING: { label: 'Recording', blurb: 'A finished record or mix.' },
  BEAT: { label: 'Beat / instrumental', blurb: 'Production somebody else can write over.' },
  SONG: { label: 'Song / composition', blurb: 'The writing underneath a recording.' },
  VIDEO: { label: 'Video', blurb: 'A film, a music video, a cut.' },
  PHOTO: { label: 'Photography', blurb: 'A shoot, a frame, a set of images.' },
  ARTWORK: { label: 'Artwork', blurb: 'A drawing, a painting, a cover.' },
  DESIGN: { label: 'Design', blurb: 'A logo, a layout, a brand.' },
  WRITING: { label: 'Writing', blurb: 'Lyrics, a script, an article.' },
  SOFTWARE: { label: 'Software', blurb: 'An app, a tool, a machine that does something.' },
  OTHER: { label: 'Something else', blurb: 'Work the list does not have a name for yet.' },
});

export const WORK_KIND_LIST = Object.freeze(
  Object.entries(WORK_KINDS).map(([id, k]) => ({ id, ...k })),
);

/** Scope of use. A venue night and a worldwide ad are not the same sale. */
export const LICENSE_SCOPES = Object.freeze({
  VENUE: { label: 'This venue only', blurb: 'Inside HITMANS VIP.' },
  LOCAL: { label: 'Tallahassee', blurb: 'One city.' },
  REGIONAL: { label: 'Statewide', blurb: 'Florida.' },
  NATIONAL: { label: 'United States', blurb: 'Nationwide.' },
  WORLD: { label: 'Worldwide', blurb: 'Anywhere.' },
});

const YEAR = 365 * 24 * 3600 * 1000;
/** How long a grant runs. PERPETUAL is allowed and is priced accordingly. */
export const LICENSE_TERMS = Object.freeze({
  ONE_NIGHT: { label: 'One night', ms: 24 * 3600 * 1000 },
  ONE_MONTH: { label: 'One month', ms: 30 * 24 * 3600 * 1000 },
  ONE_YEAR: { label: 'One year', ms: YEAR },
  THREE_YEARS: { label: 'Three years', ms: 3 * YEAR },
  PERPETUAL: { label: 'Perpetual', ms: null },
});

/** Is this grant still running? */
export function licenseActive(grant, now = Date.now()) {
  if (!grant) return false;
  if (grant.status !== 'GRANTED') return false;
  if (grant.expires_at == null) return true;          // perpetual
  return now < grant.expires_at;
}

/**
 * Can this offer be sold, given what has already been granted?
 *
 * Two ways it cannot. Somebody already holds an exclusive that covers this type,
 * or this offer is itself exclusive and a live grant would collide with it. Both
 * refuse by NAMING the grant in the way, because "unavailable" tells a creator
 * nothing about what they already sold.
 */
export function licenseConflict({ type, exclusive, existing = [], now = Date.now() }) {
  const t = LICENSE_TYPES[type];
  if (!t) return { ok: false, reason: `"${type}" is not a licence type` };
  const live = existing.filter((g) => licenseActive(g, now));

  for (const g of live) {
    if (!g.exclusive) continue;
    const blocks = LICENSE_TYPES[g.type]?.conflicts || [];
    if (g.type === type || blocks.includes(type)) {
      return {
        ok: false,
        reason: `an exclusive ${LICENSE_TYPES[g.type]?.label || g.type} licence is already held${g.buyer_name ? ` by ${g.buyer_name}` : ''}`,
        blockedBy: g.grant_id,
      };
    }
  }
  if (exclusive) {
    const clash = live.find((g) => g.type === type || (t.conflicts || []).includes(g.type));
    if (clash) {
      return {
        ok: false,
        reason: `this cannot be sold exclusively — a ${LICENSE_TYPES[clash.type]?.label || clash.type} licence is already out${clash.buyer_name ? ` to ${clash.buyer_name}` : ''}`,
        blockedBy: clash.grant_id,
      };
    }
  }
  return { ok: true };
}

/**
 * What a licence actually says, in one object, hashed into the receipt.
 *
 * Deliberately readable. A creator who cannot read their own licence has not
 * been given control of anything, and the whole point of this is control.
 */
export function licenseTerms({ type, scope, term, exclusive, credit = true }) {
  const t = LICENSE_TYPES[type];
  const s = LICENSE_SCOPES[scope];
  const d = LICENSE_TERMS[term];
  if (!t || !s || !d) return null;
  return Object.freeze({
    type, typeLabel: t.label, grants: t.grants,
    scope, scopeLabel: s.label,
    term, termLabel: d.label, termMs: d.ms,
    exclusive: !!exclusive && !!t.exclusive,
    credit: !!credit,
    // Stated on every licence, not only the AI one, so nobody can claim it was
    // implied by silence.
    aiTraining: type === 'AI_TRAINING'
      ? 'This licence DOES permit training a model on this work.'
      : 'This licence does NOT permit training a model on this work.',
    ownership: 'The creator keeps ownership of the work. This is a grant of use, not a sale of the work.',
  });
}

export function newOfferId() { return `LIC-${randomBytes(6).toString('hex').toUpperCase()}`; }
export function newGrantId() { return `GRN-${randomBytes(6).toString('hex').toUpperCase()}`; }
