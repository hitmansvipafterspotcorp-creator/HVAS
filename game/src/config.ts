// ── HVAS engine constants ───────────────────────────────────────────────────
// Single source of truth for shared app constants.

export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

// Where the UI/audio art lives, relative to the served page.
// Dev (vite root = game/) serves the symlinked public/assets at /assets/.
// Prod build is deployed to /hvas/game/ with the repo assets at /hvas/assets/.
export const ASSET_BASE = import.meta.env.DEV ? 'assets/' : '../assets/';

export const COLORS = {
  bg: 0x08060d,
} as const;

// Scene keys — keep in one place so transitions never typo a key.
export const SCENE = {
  Boot: 'Boot',
  Preload: 'Preload',
  LipsyncBingo: 'LipsyncBingo',
  HostDj: 'HostDj',
  MemberCheckIn: 'MemberCheckIn',
  Membership: 'Membership',
  AppHub: 'AppHub',
  SecurityDoor: 'SecurityDoor',
  OwnerCommand: 'OwnerCommand',
} as const;
