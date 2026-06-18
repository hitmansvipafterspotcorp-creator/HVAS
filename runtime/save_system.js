'use strict';
const SaveSystem = (() => {
  const KEY = 'hitgear_save_v1';

  const defaults = () => ({
    playerName: 'NEW MEMBER',
    characterId: 1,
    currentVenueId: 1,
    unlockedVenues: [1, 2],
    completedMissions: [],
    level: 1,
    statusPts: 0,
    coins: 0,
    stars: 0,
    settings: { sfx: true, music: true, vibration: true, devMode: false },
    bingoProgress: null,
    fastTravelPoints: [1],
    created: Date.now(),
    updated: Date.now()
  });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function save(data) {
    try {
      data.updated = Date.now();
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch { return false; }
  }

  function newGame(name = 'NEW MEMBER') {
    const d = defaults();
    d.playerName = name;
    save(d);
    return d;
  }

  function reset() {
    localStorage.removeItem(KEY);
  }

  function hasSave() {
    return !!localStorage.getItem(KEY);
  }

  function patch(updates) {
    const d = load() || defaults();
    Object.assign(d, updates);
    save(d);
    return d;
  }

  function addPts(amount) {
    const d = load() || defaults();
    d.statusPts = (d.statusPts || 0) + amount;
    d.level = calcLevel(d.statusPts);
    save(d);
    return d;
  }

  function addCoins(amount) {
    const d = load() || defaults();
    d.coins = (d.coins || 0) + amount;
    save(d);
    return d;
  }

  function addStars(amount) {
    const d = load() || defaults();
    d.stars = (d.stars || 0) + amount;
    save(d);
    return d;
  }

  function unlockVenue(id) {
    const d = load() || defaults();
    if (!d.unlockedVenues.includes(id)) {
      d.unlockedVenues.push(id);
      if (!d.fastTravelPoints.includes(id)) d.fastTravelPoints.push(id);
    }
    save(d);
    return d;
  }

  function completeMission(venueId) {
    const d = load() || defaults();
    if (!d.completedMissions.includes(venueId)) {
      d.completedMissions.push(venueId);
    }
    save(d);
    return d;
  }

  function isVenueUnlocked(id) {
    const d = load();
    if (!d) return id <= 2;
    return d.unlockedVenues.includes(id);
  }

  function isMissionComplete(venueId) {
    const d = load();
    if (!d) return false;
    return d.completedMissions.includes(venueId);
  }

  function calcLevel(pts) {
    if (pts < 1000) return 1;
    if (pts < 2500) return Math.floor(1 + (pts - 0) / 200);
    if (pts < 5000) return Math.floor(5 + (pts - 2500) / 300);
    if (pts < 10000) return Math.floor(13 + (pts - 5000) / 400);
    return Math.floor(26 + (pts - 10000) / 500);
  }

  return { load, save, newGame, reset, hasSave, patch, addPts, addCoins, addStars, unlockVenue, completeMission, isVenueUnlocked, isMissionComplete, calcLevel, defaults };
})();
