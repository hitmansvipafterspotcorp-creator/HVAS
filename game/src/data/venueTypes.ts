// Shared types for JSON-authored venues (top-down mode). Interactions are data,
// not hardcoded — the StageLoader pass will extend this same schema for full
// stage construction.
export type Facing = 'n' | 's' | 'e' | 'w';

export type VenueNpc = {
  id: string;
  charId: number;
  x: number;
  y: number;
  facing: Facing;
  name: string;
  lines: string[];
};

export type VenueTrigger = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'scene' | 'talk';
  target?: string; // scene key for type 'scene'
  label: string;
  lines?: string[]; // for type 'talk'
};

export type VenueCollider = { x: number; y: number; w: number; h: number; label?: string };

export type VenueData = {
  id: string;
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number };
  walkable: { x: number; y: number; w: number; h: number };
  colliders: VenueCollider[];
  npcs: VenueNpc[];
  triggers: VenueTrigger[];
};
