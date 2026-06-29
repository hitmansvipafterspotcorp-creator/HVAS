// Shared types for JSON-authored brawler stages. Extends the same data-driven
// pattern as venue JSON so new streets / clubs are pure data files.
import type { WaveDef } from '../systems/WaveSystem';
export type { WaveDef };

export type PropDropType = 'health' | 'meter' | 'weapon' | 'none';

export type PropDef = {
  /** Key matching the prop PNG stem, e.g. "trashcan" -> loads café8fifty_outside_trashcan.png */
  type: string;
  x: number;
  /** Depth position (feet Y). Defaults to FLOOR_BOTTOM - 20 if omitted. */
  feetY?: number;
  drop?: PropDropType;
};

export type BossDef = {
  charId: number;
  name: string;
  hp: number;
  /** Text shown in the warning banner during the reveal, e.g. "BIG SOULJA" */
  revealLabel: string;
};

export type StripEntrance = {
  venueId: string;
  x: number;
  label: string;
};

export type StageData = {
  id: string;
  name: string;
  /** Path relative to ASSET_BASE, e.g. "venues/cafe8fifty_exterior.png" */
  backdrop: string;
  waves: WaveDef[];
  /** charIds to cycle for enemy spawns — matches CHAR_FOLDERS in animMap */
  enemies: number[];
  /** Breakable foreground props. */
  props?: PropDef[];
  /** Optional end-of-stage boss encounter. */
  boss?: BossDef;
  /** VenueId unlocked after boss defeat — spawns the main entrance door. */
  venueUnlocks?: string;
  /** VenueId for an upper/rooftop level unlocked after boss defeat. */
  aboveVenueUnlocks?: string;
  /** Multiple venue entrances on a single exterior (e.g. Tally strip). */
  stripEntrances?: StripEntrance[];
  /** future: audio path relative to ASSET_BASE */
  music?: string;
  note?: string;
};
