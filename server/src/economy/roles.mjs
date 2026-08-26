// What a member actually does for a living.
//
// This started as three boxes — member, creator, business — which is the shape
// a developer reaches for and not the shape of the room. The economy around an
// after-hours venue in Tallahassee is a nail tech, a barber, a DJ, somebody's
// cousin with a food truck, a driver, a photographer, a braider working out of
// her kitchen. Calling all of that "creator" or "other" tells the venue nothing
// and tells the member they do not quite fit.
//
// So this is the trade list, grouped the way people would group themselves, and
// each role carries what it opens rather than what it is called:
//
//   sells    — can list in the members marketplace
//   creative — owns work worth registering in the IP system (§11)
//   recovery — which WORLD pathway fits when their livelihood is interrupted
//              (§49 creators, §50 small business, §37 family)
//
// The list is deliberately long. Somebody who cannot find themselves on it
// picks OTHER and types it, and what they type is kept — that is how the list
// gets longer next time, rather than by us guessing.

const R = (id, label, group, { sells = true, creative = false, recovery = 'SMALL_BUSINESS' } = {}) =>
  ({ id, label, group, sells, creative, recovery });

export const ROLE_GROUPS = Object.freeze([
  { id: 'MUSIC', label: 'Music & performance' },
  { id: 'VISUAL', label: 'Visual & media' },
  { id: 'BEAUTY', label: 'Beauty & grooming' },
  { id: 'FOOD', label: 'Food & drink' },
  { id: 'TRADE', label: 'Trades & hands-on work' },
  { id: 'SERVICE', label: 'Service & logistics' },
  { id: 'CARE', label: 'Care & teaching' },
  { id: 'PRO', label: 'Professional & admin' },
  { id: 'VENUE', label: 'Nightlife & events' },
  { id: 'NONE', label: 'Here for the room' },
]);

export const MEMBER_ROLES = Object.freeze([
  // Music & performance — creative work, registrable.
  R('ARTIST', 'Recording artist', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('RAPPER', 'Rapper / MC', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('SINGER', 'Singer', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('PRODUCER', 'Producer / beatmaker', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('DJ', 'DJ', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('DANCER', 'Dancer / choreographer', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('BAND', 'Band or group', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('ENGINEER', 'Audio engineer', 'MUSIC', { creative: true, recovery: 'CREATOR' }),
  R('COMEDIAN', 'Comedian / host', 'MUSIC', { creative: true, recovery: 'CREATOR' }),

  // Visual & media.
  R('PHOTOGRAPHER', 'Photographer', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('VIDEOGRAPHER', 'Videographer', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('EDITOR', 'Video editor', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('GRAPHIC', 'Graphic designer', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('PAINTER', 'Painter / illustrator', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('WRITER', 'Writer', 'VISUAL', { creative: true, recovery: 'CREATOR' }),
  R('ANIMATOR', 'Animator / 3D', 'VISUAL', { creative: true, recovery: 'CREATOR' }),

  // Beauty & grooming — the biggest working trade in this room.
  R('NAILS', 'Nail tech', 'BEAUTY'),
  R('BARBER', 'Barber', 'BEAUTY'),
  R('STYLIST', 'Hair stylist', 'BEAUTY'),
  R('BRAIDER', 'Braider / loctician', 'BEAUTY'),
  R('LASHES', 'Lash & brow tech', 'BEAUTY'),
  R('ESTHETICIAN', 'Esthetician / skincare', 'BEAUTY'),
  R('MAKEUP', 'Makeup artist', 'BEAUTY', { creative: true, recovery: 'CREATOR' }),
  R('TATTOO', 'Tattoo artist', 'BEAUTY', { creative: true, recovery: 'CREATOR' }),
  R('MASSAGE', 'Massage therapist', 'BEAUTY'),

  // Food & drink.
  R('COOK', 'Cook / chef', 'FOOD'),
  R('BAKER', 'Baker / pastry', 'FOOD'),
  R('CATERER', 'Caterer', 'FOOD'),
  R('FOODTRUCK', 'Food truck', 'FOOD'),
  R('BARTENDER', 'Bartender', 'FOOD'),
  R('SERVER', 'Server / barback', 'FOOD'),

  // Trades & hands-on.
  R('BUILDER', 'Contractor / handyman', 'TRADE'),
  R('ELECTRICIAN', 'Electrician', 'TRADE'),
  R('PLUMBER', 'Plumber', 'TRADE'),
  R('HVAC', 'HVAC tech', 'TRADE'),
  R('MECHANIC', 'Mechanic', 'TRADE'),
  R('AUTO_DETAIL', 'Auto detailing', 'TRADE'),
  R('LANDSCAPER', 'Landscaper / lawn care', 'TRADE'),
  R('CLEANER', 'Cleaner / housekeeping', 'TRADE'),
  R('WELDER', 'Welder / fabricator', 'TRADE'),
  R('SEAMSTRESS', 'Tailor / seamstress', 'TRADE', { creative: true }),

  // Service & logistics.
  R('DRIVER', 'Driver / rideshare', 'SERVICE'),
  R('DELIVERY', 'Delivery / courier', 'SERVICE'),
  R('MOVER', 'Mover / hauling', 'SERVICE'),
  R('SECURITY', 'Security', 'SERVICE'),
  R('RETAIL', 'Retail / resale', 'SERVICE'),
  R('VENDOR', 'Market vendor', 'SERVICE'),
  R('CRAFTS', 'Crafts & handmade', 'SERVICE', { creative: true, recovery: 'CREATOR' }),

  // Care & teaching.
  R('CHILDCARE', 'Childcare', 'CARE', { recovery: 'EMERGENCY_FAMILY' }),
  R('ELDERCARE', 'Elder care / home health', 'CARE', { recovery: 'EMERGENCY_FAMILY' }),
  R('TUTOR', 'Tutor / teacher', 'CARE', { recovery: 'YOUTH' }),
  R('COACH', 'Coach / trainer', 'CARE', { recovery: 'YOUTH' }),
  R('NURSE', 'Nurse / caregiver', 'CARE', { recovery: 'EMERGENCY_FAMILY' }),

  // Professional & admin.
  R('BOOKKEEPER', 'Bookkeeper / taxes', 'PRO'),
  R('NOTARY', 'Notary', 'PRO'),
  R('MARKETING', 'Marketing / social', 'PRO', { creative: true }),
  R('WEB', 'Web & tech', 'PRO', { creative: true }),
  R('REALESTATE', 'Real estate', 'PRO'),
  R('INSURANCE', 'Insurance / benefits', 'PRO'),

  // Nightlife & events — the people who make the night itself run.
  R('PROMOTER', 'Promoter', 'VENUE'),
  R('EVENTS', 'Event planner', 'VENUE'),
  R('STAGE', 'Stage & lighting', 'VENUE'),
  R('VENUE_OWNER', 'Venue / studio owner', 'VENUE'),

  // Here for the room. Buys nothing, sells nothing, still a member.
  R('PATRON', 'Just here for the night', 'NONE', { sells: false, recovery: 'EMERGENCY_FAMILY' }),

  // The list is not the economy. Somebody who is not on it says so.
  R('OTHER', 'Something else — I’ll say', 'NONE'),
]);

export const MEMBER_ROLE = Object.freeze(
  Object.fromEntries(MEMBER_ROLES.map((r) => [r.id, r])),
);

/** Roles under each group, in the order they are declared. */
export function rolesByGroup() {
  return ROLE_GROUPS.map((g) => ({
    ...g,
    roles: MEMBER_ROLES.filter((r) => r.group === g.id),
  })).filter((g) => g.roles.length > 0);
}

/**
 * What this member's role opens up.
 *
 * Kept as a function rather than baked into the row so that adding a capability
 * later does not mean rewriting every member's record.
 */
export function roleGrants(roleId) {
  const r = MEMBER_ROLE[roleId];
  if (!r) return { sells: false, creative: false, recovery: null };
  return { sells: !!r.sells, creative: !!r.creative, recovery: r.recovery || null };
}
