// Shared types for JSON-authored brawler stages. Extends the same data-driven
// pattern as venue JSON so new streets / clubs are pure data files.
import type { WaveDef } from '../systems/WaveSystem';
export type { WaveDef };

export type StageData = {
  id: string;
  name: string;
  /** Path relative to ASSET_BASE, e.g. "venues/cafe8fifty_exterior.png" */
  backdrop: string;
  waves: WaveDef[];
  /** charIds to cycle for enemy spawns — matches CHAR_FOLDERS in animMap */
  enemies: number[];
  /** future: audio path relative to ASSET_BASE */
  music?: string;
};
