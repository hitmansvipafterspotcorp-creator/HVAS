// ProgressionSystem: tracks which brawler stage bosses have been beaten and
// which venue interiors are unlocked. Persisted to localStorage so state
// survives page refreshes. A clean wipe is available for debugging.
const STORAGE_KEY = 'hvas_progression_v1';

export type VenueId =
  | 'hitmans_vip_inside'
  | 'dukes_inside'
  | 'kcs_inside'
  | 'outta_inside'
  | 'qhf_inside'
  | 'social_gaines_inside'
  | 'success_inside'
  | 'tally_public_hall_inside'
  | 'tally_sammys_inside'
  | 'tally_13rave_inside'
  | 'tally_den_inside'
  | 'tally_itus_inside'
  | 'success_rooftop'; // stored as unlock token, not an actual venue

export type StageId =
  | 'cafe8fifty'
  | 'dukes_exterior'
  | 'kcs_exterior'
  | 'outta_exterior'
  | 'qhf_exterior'
  | 'social_gaines_exterior'
  | 'tally_exterior';

// Which venue interior each brawler stage unlocks on boss defeat.
export const STAGE_UNLOCKS: Record<StageId, VenueId> = {
  cafe8fifty: 'hitmans_vip_inside',
  dukes_exterior: 'dukes_inside',
  kcs_exterior: 'kcs_inside',
  outta_exterior: 'outta_inside',
  qhf_exterior: 'qhf_inside',
  social_gaines_exterior: 'social_gaines_inside',
  tally_exterior: 'tally_public_hall_inside',
};

// The stages that have venue doors on the brawler map (in linear order).
export const STAGE_SEQUENCE: StageId[] = [
  'cafe8fifty',
  'dukes_exterior',
  'kcs_exterior',
  'outta_exterior',
  'qhf_exterior',
  'social_gaines_exterior',
  'tally_exterior',
];

type SaveData = {
  beatenBosses: StageId[];
  unlockedVenues: VenueId[];
};

function load(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SaveData;
  } catch {
    /* ignore */
  }
  return { beatenBosses: [], unlockedVenues: [] };
}

function save(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore — storage unavailable */
  }
}

export const ProgressionSystem = {
  isBossBeaten(stage: StageId): boolean {
    return load().beatenBosses.includes(stage);
  },

  isVenueUnlocked(venue: VenueId | string): boolean {
    return load().unlockedVenues.includes(venue as VenueId);
  },

  beatBoss(stage: StageId): void {
    const data = load();
    if (!data.beatenBosses.includes(stage)) data.beatenBosses.push(stage);
    const venue = STAGE_UNLOCKS[stage];
    if (venue && !data.unlockedVenues.includes(venue)) data.unlockedVenues.push(venue);
    save(data);
  },

  unlockVenue(venue: string): void {
    const data = load();
    if (!data.unlockedVenues.includes(venue as VenueId)) data.unlockedVenues.push(venue as VenueId);
    save(data);
  },

  getUnlockedVenues(): VenueId[] {
    return load().unlockedVenues;
  },

  getBeatenBosses(): StageId[] {
    return load().beatenBosses;
  },

  // Reset everything — call from debug menu or title screen.
  reset(): void {
    localStorage.removeItem(STORAGE_KEY);
  },

  // Dev helper: unlock everything instantly.
  unlockAll(): void {
    const data: SaveData = {
      beatenBosses: [...STAGE_SEQUENCE],
      unlockedVenues: Object.values(STAGE_UNLOCKS),
    };
    save(data);
  },
};
