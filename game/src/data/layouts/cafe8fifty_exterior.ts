// Cafe8Fifty exterior tile layout — assembled from sheets 01-04 of the
// Stage 1 Venue Pack. The pre-composited cafe8fifty_exterior.png is the
// BLUEPRINT REFERENCE — we recreate that layout here using individual tiles.
//
// Scene is 960×540. Y origin (0,0) is top-left. Tiles use bottom-center
// origin so y = where the tile's base sits on the floor / ground.

import type { TileLayout } from '../../systems/TileComposer';

export const CAFE8FIFTY_EXTERIOR_LAYOUT: TileLayout = {
  id: 'cafe8fifty_exterior',
  area: 'cafe8fifty/outside',
  prefix: 'cafe8fifty_outside_',
  tiles: [
    // ── LAYER 0: SKY BACKDROP (full width, behind everything) ───────────────
    { tile: 'night_sky_backdrop', x: 0,   y: 220, w: 960, h: 220, origin: [0, 1], depth: -2000, alpha: 1 },
    { tile: 'city_skyline_panel', x: 480, y: 260, w: 800, h: 140, depth: -1999, alpha: 0.95 },
    { tile: 'moon_cloud_sky_panel', x: 780, y: 100, w: 220, h: 110, depth: -1998, alpha: 0.9 },

    // ── LAYER 1: FACADE STRUCTURE (back wall, behind floor) ─────────────────
    { tile: 'facade_left_wing',          x: 130, y: 360, w: 230, h: 250, depth: -1900 },
    { tile: 'cafe8fifty_facade_center',  x: 460, y: 360, w: 380, h: 260, depth: -1900 },
    { tile: 'facade_right_wing',         x: 800, y: 360, w: 280, h: 250, depth: -1900 },

    // Main sign on the facade
    { tile: 'cafe8fifty_main_sign',      x: 460, y: 80,  w: 400, h: 90,  depth: -1850 },

    // Side neon "8" on the left facade
    { tile: 'neon_eight_sign',           x: 200, y: 270, w: 80,  h: 130, depth: -1840 },

    // FSU / FAMU flyer panels next to entrance
    { tile: 'fsu_famu_flyer_a',          x: 330, y: 280, w: 75,  h: 115, depth: -1840 },
    { tile: 'fsu_famu_flyer_b',          x: 410, y: 280, w: 75,  h: 115, depth: -1840 },

    // Front double door (entrance)
    { tile: 'front_double_door',         x: 510, y: 360, w: 90,  h: 165, depth: -1830 },

    // HVAS promo + members only signs on right facade
    { tile: 'hvas_promo_sign',           x: 680, y: 290, w: 90,  h: 120, depth: -1840 },
    { tile: 'members_only_panel',        x: 770, y: 290, w: 75,  h: 120, depth: -1840 },

    // VIP entry signboard
    { tile: 'cafe8fifty_side_signboard', x: 50,  y: 380, w: 75,  h: 175, depth: -1840 },

    // Tally Row street sign post (corner)
    { tile: 'tally_row_street_sign',     x: 130, y: 360, w: 85,  h: 110, depth: -1700, origin: [0.5, 1] },

    // ── LAYER 2: GROUND (floor / sidewalk between back wall and front) ──────
    // Use entry rug at the door
    { tile: 'entry_rug_850',             x: 510, y: 430, w: 110, h: 50,  depth: 350 },

    // Red rope stanchions flanking the entry
    { tile: 'red_rope_stanchion',        x: 460, y: 425, w: 70,  h: 75,  depth: 425 },
    { tile: 'red_rope_stanchion',        x: 580, y: 425, w: 70,  h: 75,  depth: 425 },

    // ── LAYER 3: TENT (right side seating) ──────────────────────────────────
    { tile: 'tent_interior_lit',         x: 800, y: 440, w: 220, h: 200, depth: 440 },

    // Smoker grill in front of tent
    { tile: 'smoker_grill',              x: 700, y: 470, w: 110, h: 95,  depth: 470 },

    // ── LAYER 4: FENCE running across foreground ────────────────────────────
    { tile: 'fence_corner',              x: 240, y: 500, w: 80,  h: 60,  depth: 500 },
    { tile: 'fence_straight',            x: 340, y: 500, w: 100, h: 50,  depth: 500 },
    { tile: 'fence_straight',            x: 460, y: 500, w: 100, h: 50,  depth: 500 },
    { tile: 'fence_straight',            x: 580, y: 500, w: 100, h: 50,  depth: 500 },
    { tile: 'fence_corner',              x: 700, y: 500, w: 80,  h: 60,  depth: 500, flipX: true },

    // ── LAYER 5: STREETLAMPS (forward props) ────────────────────────────────
    { tile: 'streetlamp',                x: 70,  y: 460, w: 35,  h: 150, depth: 460 },
    { tile: 'streetlamp',                x: 900, y: 460, w: 35,  h: 150, depth: 460 },

    // Fire hydrant + hedge planters in front strip
    { tile: 'fire_hydrant',              x: 110, y: 525, w: 30,  h: 55,  depth: 525 },
    { tile: 'hedge_planter_straight',    x: 30,  y: 538, w: 90,  h: 35,  depth: 538 },
    { tile: 'hedge_planter_corner',      x: 130, y: 538, w: 70,  h: 45,  depth: 538 },
    { tile: 'hedge_planter_straight',    x: 220, y: 538, w: 90,  h: 35,  depth: 538 },

    // Potted plants flanking the entrance
    { tile: 'potted_plant',              x: 440, y: 430, w: 38,  h: 65,  depth: 430 },
    { tile: 'potted_plant',              x: 620, y: 430, w: 38,  h: 65,  depth: 430 },

    // Misc litter for streetscape detail
    { tile: 'parking_lot_litter_set',    x: 380, y: 538, w: 80,  h: 30,  depth: 538, alpha: 0.85 },
  ],
};
