'use strict';
const VIP_TIERS = [
  { name: 'NEW MEMBER',        min: 0,     max: 999,      color: '#888888', rank: 0 },
  { name: 'VERIFIED MEMBER',   min: 1000,  max: 2499,     color: '#aaaaff', rank: 1 },
  { name: 'AFTER SPOT REGULAR',min: 2500,  max: 4999,     color: '#cc44ff', rank: 2 },
  { name: 'VIP',               min: 5000,  max: 9999,     color: '#ff00aa', rank: 3 },
  { name: 'VIP LEGEND',        min: 10000, max: Infinity, color: '#ffd700', rank: 4 }
];

const VIPStatus = {
  getTier(pts) {
    for (let i = VIP_TIERS.length - 1; i >= 0; i--) {
      if (pts >= VIP_TIERS[i].min) return VIP_TIERS[i];
    }
    return VIP_TIERS[0];
  },

  getProgress(pts) {
    const tier = this.getTier(pts);
    if (tier.max === Infinity) return 1;
    const range = tier.max - tier.min + 1;
    const progress = pts - tier.min;
    return Math.min(1, progress / range);
  },

  getNextTier(pts) {
    const tier = this.getTier(pts);
    const idx = VIP_TIERS.indexOf(tier);
    return idx < VIP_TIERS.length - 1 ? VIP_TIERS[idx + 1] : null;
  },

  getPtsToNext(pts) {
    const next = this.getNextTier(pts);
    if (!next) return 0;
    return Math.max(0, next.min - pts);
  },

  isCharUnlocked(charId, pts) {
    if (!window.CHARACTERS) return charId === 1;
    const ch = window.CHARACTERS.find(c => c.id === charId);
    if (!ch) return false;
    return pts >= (ch.unlockPts || 0);
  },

  isVenueUnlocked(venueId, pts) {
    return SaveSystem.isVenueUnlocked(venueId);
  }
};
