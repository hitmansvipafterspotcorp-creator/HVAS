// Which characters the launch slice loads. Mirrors the approved roster ids from
// the existing app. Kept tiny on purpose — we only load frames for characters
// that actually appear, never all 19 sheets.

export const PLAYER_ID = 1; // creator
export const ENEMY_IDS = [2, 10, 11, 8]; // dj, security, host, dancer
export const VENUE_NPC_IDS = [2, 9, 10, 11]; // dj, vendor, security, host

// Display names for HUD / dialogue headers.
export const CHAR_NAMES: Record<number, string> = {
  1: 'The Creator',
  2: 'DJ',
  3: 'FAMU',
  4: 'FAMU',
  5: 'Influencer',
  6: 'Photographer',
  7: 'Promoter',
  8: 'Dancer',
  9: 'Vendor',
  10: 'Security',
  11: 'Host',
  12: 'FSU',
  13: 'FSU',
  14: 'Kendrick',
  20: 'KT',
  21: 'Big Soulja',
  22: 'ELD',
  30: 'Pete',
  31: 'Snow',
};
