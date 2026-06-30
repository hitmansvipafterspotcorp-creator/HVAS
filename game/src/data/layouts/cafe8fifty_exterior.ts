// Cafe8Fifty exterior tile layout — assembled from sheets 01-04 of the
// Stage 1 Venue Pack. Coordinates are in the NATURAL 1439×677 backdrop
// space (matching the pre-composited cafe8fifty_exterior.png). TileComposer
// scales the whole composition to fit GAME_WIDTH × GAME_HEIGHT (960×540).
//
// Origin convention: bottom-center per tile (origin [0.5, 1]). y is where
// the tile's BASE sits in world coords.

import type { TileLayout } from '../../systems/TileComposer';

export const CAFE8FIFTY_EXTERIOR_LAYOUT: TileLayout = {
  id: 'cafe8fifty_exterior',
  area: 'cafe8fifty/outside',
  prefix: 'cafe8fifty_outside_',
  worldW: 1439,
  worldH: 677,
  tiles: [
    // ── LAYER 0: SKY (full width, far back) ─────────────────────────────────
    { tile: 'night_sky_backdrop',  x: 0,    y: 0,   w: 1439, h: 310, origin: [0, 0], depth: -2000 },
    { tile: 'city_skyline_panel',  x: 1080, y: 230, w: 720,  h: 150, depth: -1995 },
    { tile: 'moon_cloud_sky_panel', x: 1230, y: 110, w: 230, h: 110, depth: -1990 },

    // ── LAYER 1: FACADE (back wall) ────────────────────────────────────────
    // Center facade (CAFE 8 FIFTY sign + entry block)
    { tile: 'cafe8fifty_facade_center', x: 540, y: 420, w: 380, h: 290, depth: -1900 },
    // Left wing (with neon 8 + FSU/FAMU flyers area)
    { tile: 'facade_left_wing',         x: 250, y: 420, w: 280, h: 270, depth: -1900 },
    // Right wing (with HITMANS VIP After Spot signage + bricks toward tents)
    { tile: 'facade_right_wing',        x: 820, y: 420, w: 290, h: 270, depth: -1900 },
    // Far right wall extension (bricks toward NO PARKING sign)
    { tile: 'wall_extender_straight',   x: 1020, y: 420, w: 260, h: 270, depth: -1905 },

    // ── LAYER 2: SIGNAGE on facade (overlay clean main sign on top — the
    // version baked into the facade tiles gets cut by panel overlap) ─────
    { tile: 'cafe8fifty_main_sign',   x: 540, y: 220, w: 380, h: 95,  depth: -1850 },
    { tile: 'fsu_famu_flyer_a',       x: 390, y: 330, w: 70,  h: 130, depth: -1840 },
    { tile: 'fsu_famu_flyer_b',       x: 465, y: 330, w: 70,  h: 130, depth: -1840 },
    { tile: 'hvas_promo_sign',        x: 785, y: 320, w: 115, h: 125, depth: -1840 },
    { tile: 'no_parking_sign',        x: 1250, y: 245, w: 60, h: 80,  depth: -1840 },

    // ── LAYER 3: LEFT-SIDE PROPS ────────────────────────────────────────────
    // Streetlamp left
    { tile: 'streetlamp',             x: 145, y: 380, w: 40,  h: 280, depth: 380 },
    // CAFE 8 FIFTY signboard
    { tile: 'cafe8fifty_side_signboard', x: 65, y: 360, w: 95, h: 190, depth: 360 },
    // Tally Row street sign
    { tile: 'tally_row_street_sign',  x: 165, y: 290, w: 90, h: 105, depth: 290 },
    // Fire hydrant
    { tile: 'fire_hydrant',           x: 85,  y: 535, w: 38, h: 95,  depth: 535 },
    // Streetlamp right (mirror)
    { tile: 'streetlamp',             x: 1265, y: 350, w: 40, h: 280, depth: 350 },

    // ── LAYER 4: ENTRY (door + rug + stanchions + plants) ───────────────────
    { tile: 'front_double_door',      x: 540, y: 405, w: 120, h: 220, depth: -1830 },
    { tile: 'entry_rug_850',          x: 540, y: 405, w: 140, h: 50,  depth: 405 },
    // Red rope stanchions flanking the door
    { tile: 'red_rope_stanchion',     x: 445, y: 380, w: 70, h: 95,  depth: 380 },
    { tile: 'red_rope_stanchion',     x: 635, y: 380, w: 70, h: 95,  depth: 380 },
    // Potted plants flanking
    { tile: 'potted_plant',           x: 405, y: 380, w: 48, h: 90,  depth: 380 },
    { tile: 'potted_plant',           x: 670, y: 380, w: 48, h: 90,  depth: 380 },
    // VIP ENTRY sign
    { tile: 'vip_entry_sign',         x: 720, y: 380, w: 55, h: 90,  depth: 380 },

    // ── LAYER 5: TENTS (right side) ─────────────────────────────────────────
    { tile: 'tent_interior_lit',      x: 1090, y: 460, w: 480, h: 250, depth: 460 },
    // Smoker grill / hibachi in front of tents
    { tile: 'smoker_grill',           x: 935,  y: 495, w: 120, h: 100, depth: 495 },
    // HITMANS VIP After Spot small sign next to smoker
    { tile: 'hvas_promo_sign',        x: 1050, y: 480, w: 55,  h: 85,  depth: 480 },

    // ── LAYER 6: FENCE (zigzag across foreground) ──────────────────────────
    { tile: 'fence_corner',           x: 285,  y: 555, w: 90,  h: 90,  depth: 555 },
    { tile: 'fence_straight',         x: 380,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_straight',         x: 475,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_straight',         x: 565,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_corner',           x: 660,  y: 555, w: 90,  h: 90,  depth: 555, flipX: true },
    { tile: 'fence_straight',         x: 760,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_straight',         x: 855,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_straight',         x: 950,  y: 555, w: 90,  h: 70,  depth: 555 },
    { tile: 'fence_corner',           x: 1045, y: 555, w: 90,  h: 90,  depth: 555 },

    // ── LAYER 6.5: GROUND (asphalt with parking stripes between facade and fence)
    // 4 asphalt tiles tile across the parking lot area
    { tile: 'asphalt_tile',           x: 100,  y: 555, w: 220, h: 130, depth: -1500 },
    { tile: 'asphalt_tile',           x: 320,  y: 555, w: 220, h: 130, depth: -1500 },
    { tile: 'asphalt_tile',           x: 540,  y: 555, w: 220, h: 130, depth: -1500 },
    { tile: 'asphalt_tile',           x: 760,  y: 555, w: 220, h: 130, depth: -1500 },
    { tile: 'asphalt_tile',           x: 980,  y: 555, w: 220, h: 130, depth: -1500 },
    { tile: 'asphalt_tile',           x: 1200, y: 555, w: 220, h: 130, depth: -1500 },
    // Parking stripes (white lines on the asphalt)
    { tile: 'parking_stripe_tile',    x: 200,  y: 520, w: 130, h: 50,  depth: -1490 },
    { tile: 'parking_stripe_tile',    x: 360,  y: 520, w: 130, h: 50,  depth: -1490 },
    { tile: 'parking_stripe_tile',    x: 870,  y: 520, w: 130, h: 50,  depth: -1490 },
    { tile: 'parking_stripe_tile',    x: 1030, y: 520, w: 130, h: 50,  depth: -1490 },
    // Sidewalk along the very bottom (in front of fence)
    { tile: 'sidewalk_tile',          x: 100,  y: 615, w: 250, h: 50,  depth: -1480 },
    { tile: 'sidewalk_tile',          x: 350,  y: 615, w: 250, h: 50,  depth: -1480 },
    { tile: 'sidewalk_tile',          x: 600,  y: 615, w: 250, h: 50,  depth: -1480 },
    { tile: 'sidewalk_tile',          x: 850,  y: 615, w: 250, h: 50,  depth: -1480 },
    { tile: 'sidewalk_tile',          x: 1100, y: 615, w: 250, h: 50,  depth: -1480 },

    // ── LAYER 7: BOTTOM HEDGE WALL strip ────────────────────────────────────
    { tile: 'lot_edge_wall',          x: 0,    y: 677, w: 1439, h: 70, origin: [0, 1], depth: 670 },
    // Hedge planters along bottom
    { tile: 'hedge_planter_straight', x: 90,   y: 645, w: 150, h: 40, depth: 645 },
    { tile: 'hedge_planter_straight', x: 245,  y: 645, w: 150, h: 40, depth: 645 },
    { tile: 'hedge_planter_corner',   x: 400,  y: 645, w: 90,  h: 50, depth: 645 },
    { tile: 'hedge_planter_straight', x: 700,  y: 645, w: 150, h: 40, depth: 645 },
    { tile: 'hedge_planter_straight', x: 855,  y: 645, w: 150, h: 40, depth: 645 },
    { tile: 'hedge_planter_straight', x: 1100, y: 645, w: 150, h: 40, depth: 645 },
  ],
};
