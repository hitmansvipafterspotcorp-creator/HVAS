// HVAS — Hitmans VIP After Spot interior tile layout (top-down)
// Coordinates in natural 1920×1080 world space (matches venue JSON).
// VenueScene's camera scrolls over this world.
//
// Layout follows the finished design (hvas_pack_08_inside_finished.png):
//   Top: HITMANS VIP AFTER SPOT neon sign + CAFE 8 FIFTY sub-sign + stage
//   Top-right: VIP LOUNGE entrance
//   Left wall (top): wall counter with red stools
//   Left side: BAR WINDOW + BAR (with bottle display) + DJ BOOTH + VIP LOUNGE couch
//   Center: huge dance floor with "8" emblem
//   Right side: VIP area with stanchions/tables
//   Far left: LADIES + GENTS bathrooms, HALLWAY TO BATHROOMS, BACK EXIT
//   Bottom center: ENTRY door (neon "8") + stanchions

import type { TileLayout } from '../../systems/TileComposer';

export const HVAS_INSIDE_LAYOUT: TileLayout = {
  id: 'hvas_inside',
  area: 'hvas/inside',
  prefix: 'hvas_inside_',
  worldW: 1920,
  worldH: 1080,
  tiles: [
    // ── FLOOR: dance floor tiles (center) + hallway tiles (left strip) ──────
    // Tile dance floor across the central walkable area
    { tile: 'dance_floor_tile',     x: 700,  y: 380, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'dance_floor_tile',     x: 920,  y: 380, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'dance_floor_tile',     x: 1140, y: 380, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'dance_floor_tile',     x: 700,  y: 600, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'dance_floor_tile',     x: 920,  y: 600, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'dance_floor_tile',     x: 1140, y: 600, w: 220, h: 220, origin: [0, 0], depth: -1000 },
    // Hallway floor (left strip leading to bathrooms)
    { tile: 'hallway_floor_tile',   x: 80,   y: 320, w: 150, h: 220, origin: [0, 0], depth: -1000 },
    { tile: 'hallway_floor_tile',   x: 80,   y: 540, w: 150, h: 220, origin: [0, 0], depth: -1000 },

    // ── TOP WALL + signage ──────────────────────────────────────────────────
    { tile: 'black_brick_wall_straight', x: 0,    y: 0,   w: 1920, h: 120, origin: [0, 0], depth: -900 },
    { tile: 'main_neon_sign_hitmans_vip_after_spot', x: 960, y: 100, w: 420, h: 110, depth: 80 },
    { tile: 'sub_sign_cafe8fifty',  x: 960, y: 195, w: 220, h: 65,  depth: 90 },
    // Stage spotlights (3)
    { tile: 'gold_spotlight',       x: 820, y: 200, w: 50,  h: 100, depth: 100 },
    { tile: 'gold_spotlight',       x: 960, y: 200, w: 50,  h: 100, depth: 100 },
    { tile: 'gold_spotlight',       x: 1100,y: 200, w: 50,  h: 100, depth: 100 },
    // Flatscreen wall panels flanking the marquee
    { tile: 'flatscreen_wall_panel', x: 340, y: 130, w: 220, h: 130, depth: 100 },
    { tile: 'flatscreen_corner_set', x: 1700,y: 130, w: 220, h: 130, depth: 100 },

    // ── LEFT-SIDE BAR AREA (vertical strip) ─────────────────────────────────
    // Wall counter row (top) with stools
    { tile: 'long_marble_counter_straight', x: 280, y: 320, w: 320, h: 100, depth: 320 },
    { tile: 'long_marble_counter_corner',   x: 600, y: 320, w: 150, h: 100, depth: 320 },
    { tile: 'stool_front',          x: 320, y: 290, w: 50,  h: 60, depth: 290 },
    { tile: 'stool_front',          x: 400, y: 290, w: 50,  h: 60, depth: 290 },
    { tile: 'stool_front',          x: 480, y: 290, w: 50,  h: 60, depth: 290 },
    { tile: 'stool_front',          x: 560, y: 290, w: 50,  h: 60, depth: 290 },

    // Bar window (with stools)
    { tile: 'bar_window_frame',     x: 360, y: 440, w: 280, h: 90, depth: 440 },
    { tile: 'stool_front',          x: 310, y: 530, w: 50,  h: 60, depth: 530 },
    { tile: 'stool_front',          x: 380, y: 530, w: 50,  h: 60, depth: 530 },
    { tile: 'stool_front',          x: 450, y: 530, w: 50,  h: 60, depth: 530 },

    // Bar with bottle display
    { tile: 'bar_bottle_display',   x: 360, y: 580, w: 360, h: 100, depth: 580 },
    // Bar counter front
    { tile: 'long_marble_counter_straight', x: 360, y: 660, w: 360, h: 90, depth: 660 },

    // DJ booth + equipment
    { tile: 'dj_booth_main',        x: 360, y: 770, w: 250, h: 130, depth: 770 },
    { tile: 'dj_equipment_set',     x: 380, y: 740, w: 200, h: 60,  depth: 760 },

    // VIP lounge couch (bottom left)
    { tile: 'vip_lounge_couch',     x: 410, y: 880, w: 320, h: 130, depth: 880 },

    // ── RIGHT-SIDE VIP AREA ─────────────────────────────────────────────────
    // VIP L corner platform
    { tile: 'vip_l_corner_platform', x: 1500, y: 320, w: 350, h: 280, depth: 320 },
    // VIP lounge tables
    { tile: 'vip_lounge_table',     x: 1620, y: 380, w: 90,  h: 90, depth: 380 },
    { tile: 'vip_lounge_table',     x: 1740, y: 460, w: 90,  h: 90, depth: 460 },
    { tile: 'vip_lounge_table',     x: 1620, y: 540, w: 90,  h: 90, depth: 540 },
    // Gold stanchions around the VIP area perimeter
    { tile: 'gold_stanchion',       x: 1450, y: 320, w: 25,  h: 60, depth: 320 },
    { tile: 'gold_stanchion',       x: 1450, y: 620, w: 25,  h: 60, depth: 620 },
    { tile: 'gold_stanchion',       x: 1850, y: 320, w: 25,  h: 60, depth: 320 },
    { tile: 'gold_stanchion',       x: 1850, y: 620, w: 25,  h: 60, depth: 620 },
    // VIP rope between stanchions (top edge)
    { tile: 'vip_rope_straight',    x: 1550, y: 320, w: 100, h: 30, depth: 320 },
    { tile: 'vip_rope_straight',    x: 1750, y: 320, w: 100, h: 30, depth: 320 },

    // ── LEFT WALL: BATHROOMS + BACK EXIT ────────────────────────────────────
    // Bathroom doors
    { tile: 'bathroom_door_ladies', x: 130, y: 380, w: 90,  h: 130, depth: 380 },
    { tile: 'bathroom_door_gents',  x: 130, y: 580, w: 90,  h: 130, depth: 580 },
    // Back exit door at top-left
    { tile: 'back_exit_door',       x: 130, y: 230, w: 100, h: 100, depth: 230 },
    // Doorframes around bathroom and exit
    { tile: 'doorframe_standard',   x: 130, y: 380, w: 120, h: 140, depth: 370 },
    { tile: 'doorframe_standard',   x: 130, y: 580, w: 120, h: 140, depth: 570 },

    // ── BOTTOM: ENTRY door (with neon 8) + stanchions ───────────────────────
    { tile: 'entry_door_inner',     x: 960, y: 1010, w: 200, h: 130, depth: 1010 },
    // Red rope stanchions flanking entry
    { tile: 'gold_stanchion',       x: 880, y: 1010, w: 25,  h: 60, depth: 1010 },
    { tile: 'gold_stanchion',       x: 1040,y: 1010, w: 25,  h: 60, depth: 1010 },
    { tile: 'vip_rope_straight',    x: 960, y: 1010, w: 140, h: 30, depth: 1010 },

    // ── SPEAKERS ────────────────────────────────────────────────────────────
    { tile: 'speaker_stack',        x: 660, y: 730, w: 80,  h: 130, depth: 730 },
    { tile: 'speaker_stack',        x: 1320,y: 730, w: 80,  h: 130, depth: 730 },

    // ── AMBIENT LIGHTING / PROPS ────────────────────────────────────────────
    { tile: 'red_ambient_light',    x: 280, y: 870, w: 40,  h: 80, depth: 870 },
    { tile: 'red_ambient_light',    x: 1640,y: 870, w: 40,  h: 80, depth: 870 },
    // Wall posters
    { tile: 'wall_poster_frame',    x: 280, y: 180, w: 70,  h: 90, depth: 100 },
    { tile: 'wall_poster_frame',    x: 1660,y: 180, w: 70,  h: 90, depth: 100 },
    // Floor edge trim along bottom wall
    { tile: 'floor_edge_trim',      x: 600, y: 1080, w: 320, h: 30, origin: [0, 1], depth: 1080 },
    { tile: 'floor_edge_trim',      x: 1020,y: 1080, w: 320, h: 30, origin: [0, 1], depth: 1080 },
  ],
};
