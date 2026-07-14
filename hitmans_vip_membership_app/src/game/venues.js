// HITMANS VIP QUEST — venue registry + route graph (data-driven).
//
// Every playable zone is one entry. Exteriors are side-scrolling brawler
// stages; interiors are top-down rooms. `doors` are the portals — reaching one
// (brawler: walk to it; topdown: stand on it) and pressing Y travels the route.
// Positions are fractions so any backdrop drops in. Collision/label cleanup per
// venue is tracked separately; this is the navigable skeleton for all 19 zones.

const BASE = import.meta.env.BASE_URL;
export const VENUE_ASSET = (id) => `${BASE}assets/game/venues/${id}.png`;

export const GAME_FIGHTERS = new Set([
  'creator', 'dj', 'promoter', 'dancer', 'host', 'photographer', 'vendor',
  'security', 'influencer', 'famu_female', 'famu_male', 'fsu_female', 'fsu_male',
  'kt', 'kendrick',
]);

// mode: 'brawler' (side-scroll) | 'topdown' (4-dir interior)
// brawler door: { x, to, label }              x = fraction of world width
// topdown door: { x, y, to, label }           x,y = fraction of room rect
export const VENUES = {
  // ── Cafe8Fifty → HITMANS VIP (the signature route) ──
  cafe8fifty_exterior: {
    name: 'Cafe8Fifty', mode: 'brawler', bg: 'cafe8fifty_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.82, to: 'hvas_interior', label: 'HITMANS VIP' }],
  },
  hvas_interior: {
    name: 'HITMANS VIP After Spot', mode: 'topdown', bg: 'hvas_interior',
    spawn: { x: 0.5, y: 0.8 },
    doors: [{ x: 0.5, y: 0.93, to: 'cafe8fifty_exterior', label: 'Exit to street' }],
  },

  // ── Kingdom Come Saloon ──
  kingdom_come_exterior: {
    name: 'Kingdom Come Saloon', mode: 'brawler', bg: 'kingdom_come_exterior',
    floorY: 0.9, laneDepth: 0.09,
    doors: [{ x: 0.84, to: 'kingdom_come_interior', label: 'Saloon' }],
  },
  kingdom_come_interior: {
    name: 'Kingdom Come — Inside', mode: 'topdown', bg: 'kingdom_come_interior',
    spawn: { x: 0.5, y: 0.82 },
    doors: [{ x: 0.5, y: 0.93, to: 'kingdom_come_exterior', label: 'Exit' }],
  },

  // ── Social Gaines → Success Rooftop ──
  social_gaines_exterior: {
    name: 'Social Gaines', mode: 'brawler', bg: 'social_gaines_exterior',
    floorY: 0.92, laneDepth: 0.08,
    doors: [{ x: 0.5, to: 'social_gaines_interior', label: 'Enter' }],
  },
  social_gaines_interior: {
    name: 'Social Gaines — Inside', mode: 'topdown', bg: 'social_gaines_interior',
    spawn: { x: 0.5, y: 0.82 },
    doors: [
      { x: 0.5, y: 0.93, to: 'social_gaines_exterior', label: 'Exit' },
      { x: 0.88, y: 0.35, to: 'success_rooftop', label: 'Rooftop stairs' },
    ],
  },
  success_rooftop: {
    name: 'Success Rooftop', mode: 'topdown', bg: 'success_rooftop',
    spawn: { x: 0.5, y: 0.85 },
    doors: [{ x: 0.5, y: 0.93, to: 'social_gaines_interior', label: 'Back downstairs' }],
  },

  // ── Outta Pocket ──
  outta_pocket_exterior: {
    name: 'Outta Pocket', mode: 'brawler', bg: 'outta_pocket_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.82, to: 'outta_pocket_interior', label: 'Pool hall' }],
  },
  outta_pocket_interior: {
    name: 'Outta Pocket — Inside', mode: 'topdown', bg: 'outta_pocket_interior',
    spawn: { x: 0.5, y: 0.82 },
    doors: [{ x: 0.5, y: 0.93, to: 'outta_pocket_exterior', label: 'Exit' }],
  },

  // ── Tally Row: street → top-down commons → the 5 spots ──
  // You walk the street (brawler), enter the Tally Row commons (a walkable
  // top-down plaza — the networking hub), then pick a venue from the plaza.
  tally_row_exterior: {
    name: 'Tally Row', mode: 'brawler', bg: 'tally_row_exterior',
    floorY: 0.9, laneDepth: 0.07,
    doors: [{ x: 0.5, to: 'tally_row_topdown', label: 'Enter Tally Row' }],
  },
  tally_row_topdown: {
    name: 'Tally Row Commons', mode: 'topdown', bg: 'tally_row_topdown',
    spawn: { x: 0.5, y: 0.88 },
    doors: [
      { x: 0.26, y: 0.16, to: 'sammys_stage', label: "Sammy's" },
      { x: 0.53, y: 0.16, to: 'the_itus_pizza', label: 'The Itus' },
      { x: 0.79, y: 0.16, to: 'the_den', label: 'The Den' },
      { x: 0.19, y: 0.46, to: 'public_hall', label: 'Public Hall' },
      { x: 0.37, y: 0.46, to: 'rave_13', label: '13 Rave' },
      { x: 0.60, y: 0.95, to: 'tally_row_exterior', label: 'Exit to street' },
    ],
  },
  public_hall: {
    name: 'Public Hall', mode: 'topdown', bg: 'public_hall',
    spawn: { x: 0.5, y: 0.85 }, doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  rave_13: {
    name: '13 Rave Club', mode: 'topdown', bg: 'rave_13',
    spawn: { x: 0.5, y: 0.85 }, doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  sammys_stage: {
    name: "Sammy's Stage", mode: 'topdown', bg: 'sammys_stage',
    spawn: { x: 0.5, y: 0.85 }, doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  the_itus_pizza: {
    name: 'The Itus Pizza', mode: 'topdown', bg: 'the_itus_pizza',
    spawn: { x: 0.5, y: 0.85 }, doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  the_den: {
    name: 'The Den', mode: 'topdown', bg: 'the_den',
    spawn: { x: 0.5, y: 0.85 }, doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },

  // ── Dukes & Dimes ──
  dukes_dimes_exterior: {
    name: 'Dukes & Dimes', mode: 'brawler', bg: 'dukes_dimes_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.82, to: 'dukes_dimes_interior', label: 'Enter' }],
  },
  dukes_dimes_interior: {
    name: 'Dukes & Dimes — Inside', mode: 'topdown', bg: 'dukes_dimes_interior',
    spawn: { x: 0.5, y: 0.82 }, doors: [{ x: 0.5, y: 0.93, to: 'dukes_dimes_exterior', label: 'Exit' }],
  },

  // ── Quick Hit Fuel ──
  quick_hit_fuel_exterior: {
    name: 'Quick Hit Fuel', mode: 'brawler', bg: 'quick_hit_fuel_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.8, to: 'quick_hit_fuel_interior', label: 'Store' }],
  },
  quick_hit_fuel_interior: {
    name: 'Quick Hit Fuel — Store', mode: 'topdown', bg: 'quick_hit_fuel_interior',
    spawn: { x: 0.5, y: 0.82 }, doors: [{ x: 0.5, y: 0.93, to: 'quick_hit_fuel_exterior', label: 'Exit' }],
  },
};

// Ordered zone list for the venue selector (grouped by district).
export const ZONE_ORDER = [
  'cafe8fifty_exterior', 'hvas_interior',
  'kingdom_come_exterior', 'kingdom_come_interior',
  'social_gaines_exterior', 'social_gaines_interior', 'success_rooftop',
  'outta_pocket_exterior', 'outta_pocket_interior',
  'tally_row_exterior', 'tally_row_topdown', 'public_hall', 'rave_13', 'sammys_stage', 'the_itus_pizza', 'the_den',
  'dukes_dimes_exterior', 'dukes_dimes_interior',
  'quick_hit_fuel_exterior', 'quick_hit_fuel_interior',
];
