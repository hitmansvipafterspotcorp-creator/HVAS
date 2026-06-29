// ── HVAS engine constants ───────────────────────────────────────────────────
// Single source of truth for the 2.5D brawler math. The depth gate (see
// systems/DepthGateSystem) reads FLOOR_TOP/FLOOR_BOTTOM and LANE_TOLERANCE to
// decide whether an attack and a target share a floor lane.

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Where the character/venue art lives, relative to the served page.
// Dev (vite root = game/) serves the symlinked public/assets at /assets/.
// Prod build is deployed to /hvas/game/ with the repo assets at /hvas/assets/.
export const ASSET_BASE = import.meta.env.DEV ? 'assets/' : '../assets/';

// The walkable floor is the vertical band where feet (the y of a fighter)
// may sit. Smaller y = farther back ("up the screen"), larger y = closer.
export const FLOOR_TOP = 360; // back wall of the playable floor
export const FLOOR_BOTTOM = 510; // front edge of the playable floor

// A hit only lands when attacker and target feet-y are within this many px.
// This is the core of the 2.5D depth gate: wrong-lane enemies miss.
export const LANE_TOLERANCE = 26;

export const PLAYER_SPEED = 220; // px/sec horizontal
export const PLAYER_DEPTH_SPEED = 150; // px/sec vertical (into/out of screen)

export const COLORS = {
  bg: 0x08060d,
  floor: 0x1a1326,
  floorLine: 0x2e2240,
  player: 0xffd700,
  playerDark: 0xaa8800,
  enemy: 0xcc2244,
  enemyDark: 0x771122,
  boss: 0x9933cc,
  hitspark: 0xfff2a0,
  meter: 0x44ccff,
  health: 0x33dd66,
  healthBad: 0xdd3344,
  debug: 0x00ff88,
} as const;

// Scene keys — keep in one place so transitions never typo a key.
export const SCENE = {
  Boot: 'Boot',
  Preload: 'Preload',
  MainMenu: 'MainMenu',
  Brawler: 'Brawler',
  Venue: 'Venue',
  LevelEditor: 'LevelEditor',
  ArcadeVs: 'ArcadeVs',
  StageSelect: 'StageSelect',
  VenueSelect: 'VenueSelect',
} as const;
