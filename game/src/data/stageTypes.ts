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
  /** future: audio path relative to ASSET_BASE */
  music?: string;
};
