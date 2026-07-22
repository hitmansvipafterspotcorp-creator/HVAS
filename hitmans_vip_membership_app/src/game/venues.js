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
  'korey',
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
    // the swinging saloon doors sit center-right of the facade
    doors: [{ x: 0.6, to: 'kingdom_come_interior', label: 'Saloon' }],
  },
  kingdom_come_interior: {
    name: 'Kingdom Come — Inside', mode: 'topdown', bg: 'kingdom_come_interior',
    spawn: { x: 0.46, y: 0.86 },
    // reach the dart wall up top and the whole floor
    walk: { left: 0.07, right: 0.9, top: 0.11, bottom: 0.9 },
    // solid furniture you walk around: central U-bar + the four pool tables
    blockers: [
      { x: 0.29, y: 0.25, w: 0.4, h: 0.33 },   // central U-bar island
      { x: 0.12, y: 0.42, w: 0.12, h: 0.14 },  // pool table (left upper)
      { x: 0.12, y: 0.58, w: 0.12, h: 0.14 },  // pool table (left lower)
      { x: 0.77, y: 0.38, w: 0.12, h: 0.14 },  // pool table (right upper)
      { x: 0.77, y: 0.56, w: 0.12, h: 0.14 },  // pool table (right lower)
    ],
    // people + points of interest, placed on the real floor plan
    spots: [
      { x: 0.46, y: 0.63, label: 'Bartender', line: "Kingdom Come pours 'em stiff — tip or the Hitman slaps ya." },
      { x: 0.3, y: 0.17, label: 'Dart Stations', line: 'Bullseye buys the next round. You game?' },
      { x: 0.55, y: 0.18, label: 'Open Mic', line: 'Live music at 10 — The Outlaws. Grab a seat.' },
      { x: 0.24, y: 0.52, label: 'Pool Shark', line: "Rack 'em. Loser covers the sake shots." },
      { x: 0.76, y: 0.48, label: 'Pool Table', line: 'Nine ball, corner pocket — money on the rail.' },
      { x: 0.89, y: 0.4, label: 'Back Door', line: "Out back's the lot. Keep it moving, partner." },
    ],
    doors: [{ x: 0.46, y: 0.95, to: 'kingdom_come_exterior', label: 'Exit' }],
  },

  // ── Social Gaines → Success Rooftop ──
  social_gaines_exterior: {
    name: 'Social Gaines', mode: 'brawler', bg: 'social_gaines_exterior',
    floorY: 0.92, laneDepth: 0.08,
    doors: [{ x: 0.6, to: 'social_gaines_interior', label: 'Enter' }],  // SG double doors
  },
  social_gaines_interior: {
    name: 'Social Gaines — Inside', mode: 'topdown', bg: 'social_gaines_interior',
    spawn: { x: 0.5, y: 0.82 },
    walk: { left: 0.06, right: 0.94, top: 0.3, bottom: 0.86 },
    blockers: [
      { x: 0.5, y: 0.03, w: 0.47, h: 0.28 },   // long bar (top-right)
      { x: 0.05, y: 0.3, w: 0.13, h: 0.38 },   // velvet booths (left wall)
      { x: 0.38, y: 0.46, w: 0.22, h: 0.24 },  // center lounge sofas
      { x: 0.66, y: 0.48, w: 0.16, h: 0.22 },  // leather lounge (right)
      { x: 0.9, y: 0.48, w: 0.09, h: 0.22 },   // live-music corner
    ],
    spots: [
      { x: 0.68, y: 0.35, label: 'Bartender', line: "Social Gaines — grown & classy. What're we sippin'?" },
      { x: 0.28, y: 0.44, label: 'Cocktail Tables', line: 'Pull up a stool, meet somebody new.' },
      { x: 0.2, y: 0.5, label: 'Booths', line: 'Green velvet booths — post up with your crew.' },
      { x: 0.48, y: 0.74, label: 'VIP Lounge', line: 'Bottle service in the lounge. Very Social Gaines.' },
      { x: 0.74, y: 0.74, label: 'Leather Lounge', line: 'Sink into the leather — networking happens here.' },
      { x: 0.88, y: 0.74, label: 'Live Music', line: 'Smooth sounds all night. Grab the mic later.' },
    ],
    doors: [
      { x: 0.5, y: 0.93, to: 'social_gaines_exterior', label: 'Exit' },
      { x: 0.1, y: 0.3, to: 'success_rooftop', label: 'Rooftop stairs' },  // staircase (top-left)
    ],
  },
  success_rooftop: {
    name: 'Success Rooftop', mode: 'topdown', bg: 'success_rooftop',
    spawn: { x: 0.18, y: 0.62 },
    walk: { left: 0.05, right: 0.95, top: 0.28, bottom: 0.9 },
    blockers: [
      { x: 0.28, y: 0.34, w: 0.42, h: 0.3 },   // the pool (no walking on water)
      { x: 0.4, y: 0.1, w: 0.24, h: 0.18 },    // rooftop bar (top)
      { x: 0.14, y: 0.26, w: 0.16, h: 0.16 },  // cabana daybeds (left)
      { x: 0.8, y: 0.3, w: 0.16, h: 0.34 },    // umbrella loungers (right)
      { x: 0.36, y: 0.66, w: 0.36, h: 0.16 },  // VIP sofas (bottom)
    ],
    spots: [
      { x: 0.52, y: 0.3, label: 'Rooftop Bar', line: 'Top of the city — bottle service and a skyline.' },
      { x: 0.24, y: 0.5, label: 'Poolside', line: 'Dip in or just floss by the water.' },
      { x: 0.2, y: 0.44, label: 'Cabana', line: 'Private cabana — VIP only up here.' },
      { x: 0.76, y: 0.52, label: 'Sun Loungers', line: 'Umbrellas, loungers, city lights. Unwind.' },
      { x: 0.53, y: 0.86, label: 'VIP Sofas', line: "Grab a sofa — the night's just starting." },
    ],
    doors: [{ x: 0.08, y: 0.7, to: 'social_gaines_interior', label: 'Back downstairs' }],
  },

  // ── Outta Pocket ──
  outta_pocket_exterior: {
    name: 'Outta Pocket', mode: 'brawler', bg: 'outta_pocket_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.82, to: 'outta_pocket_interior', label: 'Pool hall' }],
  },
  outta_pocket_interior: {
    name: 'Outta Pocket — Inside', mode: 'topdown', bg: 'outta_pocket_interior',
    spawn: { x: 0.45, y: 0.82 },
    walk: { left: 0.06, right: 0.94, top: 0.25, bottom: 0.86 },
    blockers: [
      { x: 0.36, y: 0.06, w: 0.2, h: 0.16 },   // DJ booth (top)
      { x: 0.34, y: 0.3, w: 0.14, h: 0.12 },   // pool table (upper-left)
      { x: 0.51, y: 0.3, w: 0.14, h: 0.12 },   // pool table (upper-right)
      { x: 0.34, y: 0.45, w: 0.14, h: 0.12 },  // pool table (lower-left)
      { x: 0.51, y: 0.45, w: 0.14, h: 0.12 },  // pool table (lower-right)
      { x: 0.29, y: 0.6, w: 0.4, h: 0.1 },     // main bar (center)
      { x: 0.66, y: 0.33, w: 0.28, h: 0.1 },   // side bar (right)
      { x: 0.74, y: 0.04, w: 0.24, h: 0.22 },  // kitchen (top-right)
      { x: 0.05, y: 0.05, w: 0.1, h: 0.5 },    // booth wall (left)
    ],
    spots: [
      { x: 0.45, y: 0.24, label: 'DJ Booth', line: "DJ's spinning — Outta Pocket, loud and packed." },
      { x: 0.47, y: 0.55, label: 'Pool Tables', line: "Four tables, always a game. Rack 'em." },
      { x: 0.45, y: 0.73, label: 'Main Bar', line: 'Cold ones down the line. What are you having?' },
      { x: 0.85, y: 0.3, label: 'Kitchen', line: 'Late-night eats straight from the kitchen.' },
      { x: 0.18, y: 0.4, label: 'Booths', line: 'Booths on the wall — post up with the crew.' },
    ],
    doors: [{ x: 0.45, y: 0.93, to: 'outta_pocket_exterior', label: 'Exit' }],
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
    spawn: { x: 0.55, y: 0.72 },
    walk: { left: 0.08, right: 0.92, top: 0.14, bottom: 0.9 },
    blockers: [{ x: 0.44, y: 0.48, w: 0.14, h: 0.14 }],  // outdoor DJ rig
    spots: [
      { x: 0.5, y: 0.66, label: 'Block DJ', line: 'Tally Row block party — DJ live in the plaza.' },
      { x: 0.24, y: 0.6, label: 'Valet', line: 'Express, regular, VIP — we got you parked.' },
    ],
    doors: [
      { x: 0.26, y: 0.16, to: 'sammys_stage', label: "Sammy's" },
      { x: 0.53, y: 0.16, to: 'the_itus_pizza', label: 'The Itus' },
      { x: 0.79, y: 0.16, to: 'the_den', label: 'The Den' },
      { x: 0.19, y: 0.46, to: 'public_hall', label: 'Public Hall' },
      { x: 0.37, y: 0.46, to: 'rave_13', label: '13 Rave' },
      { x: 0.6, y: 0.95, to: 'tally_row_exterior', label: 'Exit to street' },
    ],
  },
  public_hall: {
    name: 'Public Hall', mode: 'topdown', bg: 'public_hall',
    spawn: { x: 0.45, y: 0.82 },
    walk: { left: 0.06, right: 0.95, top: 0.22, bottom: 0.86 },
    blockers: [
      { x: 0.16, y: 0.03, w: 0.26, h: 0.16 },  // stage
      { x: 0.05, y: 0.2, w: 0.22, h: 0.45 },   // arcade / skeeball / air hockey wall
      { x: 0.66, y: 0.05, w: 0.14, h: 0.4 },   // bar (right)
      { x: 0.46, y: 0.3, w: 0.16, h: 0.3 },    // center lounge
      { x: 0.25, y: 0.66, w: 0.14, h: 0.12 },  // pool table (left)
      { x: 0.5, y: 0.66, w: 0.14, h: 0.12 },   // pool table (right)
    ],
    spots: [
      { x: 0.3, y: 0.22, label: 'Live Stage', line: 'Public Hall — live band all night.' },
      { x: 0.22, y: 0.4, label: 'Arcade', line: 'Skeeball, air hockey, retro cabinets. Go.' },
      { x: 0.6, y: 0.35, label: 'Bar', line: 'Cold drinks at the bar.' },
      { x: 0.55, y: 0.62, label: 'Lounge', line: 'Leather lounge on the rug — chill zone.' },
      { x: 0.42, y: 0.8, label: 'Pool Tables', line: "Rack 'em — two tables open." },
      { x: 0.85, y: 0.75, label: 'Darts', line: 'Darts in the corner. Bullseye.' },
    ],
    doors: [{ x: 0.45, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  rave_13: {
    name: '13 Rave Club', mode: 'topdown', bg: 'rave_13',
    spawn: { x: 0.58, y: 0.82 },
    walk: { left: 0.08, right: 0.86, top: 0.25, bottom: 0.88 },
    blockers: [
      { x: 0.5, y: 0.04, w: 0.2, h: 0.16 },    // DJ booth (top)
      { x: 0.1, y: 0.32, w: 0.14, h: 0.28 },   // neon oval bar (left)
    ],
    spots: [
      { x: 0.58, y: 0.24, label: 'DJ Booth', line: "13 Rave — hands up, the drop's coming." },
      { x: 0.58, y: 0.55, label: 'Dance Floor', line: 'Lose yourself on the floor.' },
      { x: 0.28, y: 0.45, label: 'Neon Bar', line: 'Glow-up cocktails at the bar.' },
      { x: 0.2, y: 0.72, label: 'VIP Couches', line: 'Neon booths — bottle service, 13 style.' },
    ],
    doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  sammys_stage: {
    name: "Sammy's Stage", mode: 'topdown', bg: 'sammys_stage',
    spawn: { x: 0.5, y: 0.82 },
    walk: { left: 0.08, right: 0.88, top: 0.28, bottom: 0.86 },
    blockers: [
      { x: 0.38, y: 0.06, w: 0.24, h: 0.2 },   // main stage
      { x: 0.1, y: 0.06, w: 0.16, h: 0.16 },   // DJ booth
      { x: 0.22, y: 0.3, w: 0.1, h: 0.35 },    // left bar
      { x: 0.68, y: 0.3, w: 0.1, h: 0.35 },    // right bar
      { x: 0.05, y: 0.32, w: 0.14, h: 0.32 },  // VIP booths (left)
    ],
    spots: [
      { x: 0.5, y: 0.32, label: 'Main Stage', line: "Sammy's — the show's about to start." },
      { x: 0.2, y: 0.28, label: 'DJ', line: "DJ keeping it hot at Sammy's." },
      { x: 0.36, y: 0.5, label: 'Left Bar', line: 'Drinks on the rail.' },
      { x: 0.64, y: 0.5, label: 'Right Bar', line: 'Top shelf this side.' },
      { x: 0.16, y: 0.68, label: 'VIP Booths', line: 'VIP booths — bottle service and a view.' },
    ],
    doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  the_itus_pizza: {
    name: 'The Itus Pizza', mode: 'topdown', bg: 'the_itus_pizza',
    spawn: { x: 0.42, y: 0.78 },
    walk: { left: 0.14, right: 0.94, top: 0.28, bottom: 0.82 },
    blockers: [
      { x: 0.24, y: 0.1, w: 0.34, h: 0.2 },    // pizza counter / oven
      { x: 0.74, y: 0.06, w: 0.22, h: 0.22 },  // VIP lounge (top-right)
      { x: 0.44, y: 0.42, w: 0.2, h: 0.28 },   // center after-dark lounge
      { x: 0.78, y: 0.58, w: 0.14, h: 0.18 },  // DJ booth (bottom-right)
    ],
    spots: [
      { x: 0.4, y: 0.34, label: 'Pizza Counter', line: 'Itus Pizza — hot slices, good vibes.' },
      { x: 0.8, y: 0.34, label: 'VIP Lounge', line: 'Good vibes, hot slices — VIP booths up top.' },
      { x: 0.54, y: 0.74, label: 'Chill Lounge', line: 'Itus After Dark — sink into the couches.' },
      { x: 0.72, y: 0.74, label: 'Live DJs', line: 'Live DJs spinning late.' },
      { x: 0.18, y: 0.62, label: 'Drinks Pick-Up', line: 'Grab your drinks at pick-up.' },
    ],
    doors: [{ x: 0.42, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },
  the_den: {
    name: 'The Den', mode: 'topdown', bg: 'the_den',
    spawn: { x: 0.5, y: 0.82 },
    walk: { left: 0.18, right: 0.94, top: 0.28, bottom: 0.86 },
    blockers: [
      { x: 0.26, y: 0.08, w: 0.44, h: 0.24 },  // long bar (top)
      { x: 0.74, y: 0.1, w: 0.2, h: 0.7 },     // purple couches (right wall)
    ],
    spots: [
      { x: 0.42, y: 0.4, label: 'Bar', line: 'The Den — low lights, top shelf.' },
      { x: 0.5, y: 0.6, label: 'Dance Floor', line: 'Feel the beat on the floor.' },
      { x: 0.68, y: 0.35, label: 'VIP Couches', line: "Purple velvet — The Den's inner circle." },
      { x: 0.32, y: 0.62, label: 'Lounge Tables', line: 'Pull up a table, stay a while.' },
    ],
    doors: [{ x: 0.5, y: 0.93, to: 'tally_row_topdown', label: 'Back to commons' }],
  },

  // ── Dukes & Dimes ──
  dukes_dimes_exterior: {
    name: 'Dukes & Dimes', mode: 'brawler', bg: 'dukes_dimes_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.82, to: 'dukes_dimes_interior', label: 'Enter' }],
  },
  dukes_dimes_interior: {
    name: 'Dukes & Dimes — Inside', mode: 'topdown', bg: 'dukes_dimes_interior',
    spawn: { x: 0.45, y: 0.8 },
    walk: { left: 0.08, right: 0.9, top: 0.22, bottom: 0.82 },
    blockers: [
      { x: 0.18, y: 0.2, w: 0.18, h: 0.28 },   // mechanical bull ring
      { x: 0.32, y: 0.04, w: 0.2, h: 0.16 },   // live stage
      { x: 0.56, y: 0.1, w: 0.16, h: 0.4 },    // U-bar (right)
      { x: 0.28, y: 0.54, w: 0.34, h: 0.18 },  // center dining tables
      { x: 0.09, y: 0.5, w: 0.1, h: 0.24 },    // booths (left)
    ],
    spots: [
      { x: 0.26, y: 0.5, label: 'Mechanical Bull', line: 'Ride the bull — hold on tight, cowboy.' },
      { x: 0.42, y: 0.24, label: 'Live Stage', line: 'Live band tonight at Dukes & Dimes.' },
      { x: 0.5, y: 0.34, label: 'Bar', line: 'Whiskey and dimes. Belly up.' },
      { x: 0.45, y: 0.76, label: 'Dining', line: "Grab a table — kitchen's open." },
      { x: 0.2, y: 0.64, label: 'Booths', line: 'Red leather booths — settle in.' },
    ],
    doors: [{ x: 0.45, y: 0.93, to: 'dukes_dimes_exterior', label: 'Exit' }],
  },

  // ── Quick Hit Fuel ──
  quick_hit_fuel_exterior: {
    name: 'Quick Hit Fuel', mode: 'brawler', bg: 'quick_hit_fuel_exterior',
    floorY: 0.9, laneDepth: 0.08,
    doors: [{ x: 0.8, to: 'quick_hit_fuel_interior', label: 'Store' }],
  },
  quick_hit_fuel_interior: {
    name: 'Quick Hit Fuel — Store', mode: 'topdown', bg: 'quick_hit_fuel_interior',
    spawn: { x: 0.5, y: 0.82 },
    walk: { left: 0.1, right: 0.9, top: 0.32, bottom: 0.86 },
    blockers: [
      { x: 0.26, y: 0.16, w: 0.48, h: 0.14 },  // hot food counter (top)
      { x: 0.32, y: 0.36, w: 0.05, h: 0.24 },  // snack aisle 1
      { x: 0.43, y: 0.36, w: 0.05, h: 0.24 },  // snack aisle 2
      { x: 0.54, y: 0.36, w: 0.05, h: 0.24 },  // snack aisle 3
      { x: 0.24, y: 0.64, w: 0.46, h: 0.08 },  // checkout counter
      { x: 0.14, y: 0.56, w: 0.12, h: 0.14 },  // ATM / lottery
      { x: 0.78, y: 0.3, w: 0.08, h: 0.44 },   // drink coolers (right wall)
    ],
    spots: [
      { x: 0.45, y: 0.34, label: 'Hot Food', line: 'Fuel up — quick bites, coffee & go.' },
      { x: 0.49, y: 0.62, label: 'Snack Aisles', line: 'Grab your snacks — everything for the run.' },
      { x: 0.47, y: 0.76, label: 'Checkout', line: 'Ring it up at Quick Hit Fuel.' },
      { x: 0.2, y: 0.74, label: 'ATM & Lottery', line: 'Cash out or hit the lottery. Feeling lucky?' },
      { x: 0.72, y: 0.5, label: 'Coolers', line: 'Cold drinks down the right wall.' },
    ],
    doors: [{ x: 0.5, y: 0.93, to: 'quick_hit_fuel_exterior', label: 'Exit' }],
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
