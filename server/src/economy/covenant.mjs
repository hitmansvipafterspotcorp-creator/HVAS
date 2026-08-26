// The Community Covenant, and what a member agrees to before they are in.
//
// §2 says to read and preserve the operating principles of the Peace &
// Prosperity / KODEX package — the Community Covenant / Magna Charta among
// them — and names the ones that matter: Prosperity with Duty, reserve
// discipline, emergency readiness, family stabilisation, housing, food,
// creator opportunity, youth, continuity.
//
// This is those principles said in the words a member would use, short enough
// that somebody standing at a door on a Saturday night will actually read it.
// A covenant nobody reads is a checkbox, and a checkbox is not an agreement.
//
// It is VERSIONED and the version is stored with the agreement. When the terms
// change, what somebody agreed to does not silently change with them — they are
// asked again, and the old record still says what they actually accepted.

export const COVENANT_VERSION = '2026.1';

export const COVENANT = Object.freeze({
  version: COVENANT_VERSION,
  title: 'The Community Covenant',
  lead: 'HITMANS VIP is a members-only room that runs a community reserve. '
      + 'Membership is not only access — it is standing behind the mission.',
  clauses: Object.freeze([
    {
      id: 'DUTY',
      heading: 'Prosperity with duty',
      body: 'What this room earns is meant to come back to the people in it. '
          + 'A share of what the venue takes goes to the community reserve, and I am here for that as well as for the night.',
    },
    {
      id: 'SUPPORT',
      heading: 'I support the mission and the fundraising',
      body: 'I will back the programmes — by giving when I can, by serving when I am able, or by bringing people who will. '
          + 'Nobody is required to give money, and nobody is here who does not want the mission to succeed.',
    },
    {
      id: 'RESERVE',
      heading: 'The reserve is not anybody’s money',
      body: 'It is held for the programmes. No member, staff member or founder owns it, '
          + 'and it is released only under the adopted policy by more than one person.',
    },
    {
      id: 'HONESTY',
      heading: 'I will be honest about money and about need',
      body: 'I will not claim support I do not need, confirm money that has not arrived, '
          + 'or use another member’s identity or pass.',
    },
    {
      id: 'RESPECT',
      heading: 'I will treat the room and the people in it well',
      body: 'The door decides who comes in. What happens between members here is theirs, '
          + 'and what a member shares in confidence stays that way.',
    },
    {
      id: 'READINESS',
      heading: 'When somebody needs help, the room shows up',
      body: 'Emergency capacity only exists because it was kept ready. '
          + 'I accept that the reserve says no when it must, so that it can say yes when it counts.',
    },
  ]),
  // Said plainly at the end, because this is the part that is actually a
  // condition of being here.
  accept: 'I have read this, I agree to it, and I want to support the mission.',
});

// ── Every version, kept ───────────────────────────────────────────────────
//
// A covenant that can be edited after the fact is not an agreement, it is a
// notice. When the terms change, the member is asked again — and the record of
// what they accepted has to still be readable, in the words they accepted, or
// the record proves nothing.
//
// So versions are archived here rather than replaced. When 2026.1 is superseded
// it does not get deleted: it moves down this list and stays retrievable by
// everyone who signed it. Adding a version means adding an entry, never editing
// one, and there is a test that fails if a published version's text changes.
const ARCHIVE = Object.freeze({ [COVENANT_VERSION]: COVENANT });

/** The covenant as it read at a given version — what somebody actually signed. */
export function covenantAt(version) {
  return ARCHIVE[String(version || '')] || null;
}

/** Every version this association has ever published, newest first. */
export function covenantVersions() {
  return Object.keys(ARCHIVE).sort().reverse();
}

/**
 * A stable fingerprint of a covenant's text.
 *
 * The point is not secrecy. It is that a member holding this number, and the
 * association holding the same number, are demonstrably talking about the same
 * document — without either having to trust the other's copy.
 */
export function covenantFingerprint(doc) {
  const d = doc || COVENANT;
  const canonical = [
    d.version, d.title, d.lead,
    ...d.clauses.map((c) => `${c.id}|${c.heading}|${c.body}`),
    d.accept,
  ].join('\n');
  // FNV-1a, 32-bit, rendered as eight hex characters. Short enough to read out
  // over a phone, which is the only place a member would ever need to.
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * What is still missing before somebody is a member of this place.
 *
 * Returned as a list of steps rather than a boolean, because "not accepted" is
 * useless to somebody standing there — they need to know which part is left.
 */
export function onboardingState({ agreedVersion = null, memberRole = null, program = null, knownRole = () => true } = {}) {
  const steps = [
    {
      id: 'AGREE',
      label: 'Agree to the Community Covenant',
      done: agreedVersion === COVENANT_VERSION,
      // Somebody who agreed to an older version has not refused anything — they
      // simply have not seen this one.
      stale: !!agreedVersion && agreedVersion !== COVENANT_VERSION,
    },
    { id: 'ROLE', label: 'Say what you do', done: !!memberRole && knownRole(memberRole) },
    { id: 'PROGRAM', label: 'Choose a programme to stand behind', done: !!program },
  ];
  const next = steps.find((s) => !s.done) || null;
  return { accepted: steps.every((s) => s.done), steps, next, version: COVENANT_VERSION };
}
