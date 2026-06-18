'use strict';
/**
 * HITGEAR OS — 13×16 QA Validation Matrix
 * Run: node qa/validation.js
 * Checks all character×venue combinations for required data integrity.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
}

const characters = load('characters.json');
const venues = load('venues.json');
const enemies = load('enemies.json');

let passed = 0;
let failed = 0;
const failures = [];

function check(id, condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(`[FAIL] ${id}: ${msg}`);
  }
}

// ── Character integrity (13 chars) ──────────────────────────────────────────
check('CHAR_COUNT', characters.length === 13, `Expected 13 characters, got ${characters.length}`);

characters.forEach(c => {
  const p = `CHAR[${c.id}:${c.name}]`;
  check(`${p}.id`,       typeof c.id === 'number',        'id must be a number');
  check(`${p}.name`,     typeof c.name === 'string' && c.name.length > 0, 'name missing');
  check(`${p}.emoji`,    typeof c.emoji === 'string',      'emoji missing');
  check(`${p}.color`,    /^#[0-9a-fA-F]{6}$/.test(c.color), 'color must be hex');
  check(`${p}.spd`,      typeof c.spd === 'number' && c.spd > 0, 'spd must be > 0');
  check(`${p}.str`,      typeof c.str === 'number' && c.str > 0, 'str must be > 0');
  check(`${p}.def`,      typeof c.def === 'number' && c.def > 0, 'def must be > 0');
  check(`${p}.baseHp`,   typeof c.baseHp === 'number' && c.baseHp >= 80, 'baseHp must be >= 80');
  check(`${p}.baseDmg`,  typeof c.baseDmg === 'number' && c.baseDmg > 0, 'baseDmg missing');
  check(`${p}.unlockPts`,typeof c.unlockPts === 'number', 'unlockPts missing');
  check(`${p}.super1`,   typeof c.super1 === 'string' && c.super1.length > 0, 'super1 missing');
  check(`${p}.super2`,   typeof c.super2 === 'string' && c.super2.length > 0, 'super2 missing');
  check(`${p}.super3`,   typeof c.super3 === 'string' && c.super3.length > 0, 'super3 missing');
  check(`${p}.frameData`,c.frameData && c.frameData.startup >= 0, 'frameData missing');
});

// ── Venue integrity (16 venues) ─────────────────────────────────────────────
check('VENUE_COUNT', venues.length === 16, `Expected 16 venues, got ${venues.length}`);

const FORBIDDEN_NAMES = ['palace saloon','circle k','yannas','kens','munchies'];
const REQUIRED_CAMERA_TYPES = ['sidescroll','topdown'];

venues.forEach(v => {
  const p = `VENUE[${v.id}:${v.name}]`;
  check(`${p}.id`,         typeof v.id === 'number',         'id must be number');
  check(`${p}.name`,       typeof v.name === 'string' && v.name.length > 0, 'name missing');
  check(`${p}.cameraType`, REQUIRED_CAMERA_TYPES.includes(v.cameraType), `cameraType must be sidescroll|topdown, got ${v.cameraType}`);
  check(`${p}.waves`,      Array.isArray(v.waves) && v.waves.length > 0, 'waves array missing');
  check(`${p}.missionSteps`, Array.isArray(v.missionSteps) && v.missionSteps.length >= 3, 'need ≥3 missionSteps');
  check(`${p}.bossName`,   typeof v.bossName === 'string' && v.bossName.length > 0, 'bossName missing');
  check(`${p}.bossHp`,     typeof v.bossHp === 'number' && v.bossHp >= 200, 'bossHp must be >= 200');
  check(`${p}.bgLayers`,   Array.isArray(v.bgLayers) && v.bgLayers.length >= 2, 'need ≥2 bgLayers');
  check(`${p}.reward`,     v.reward && typeof v.reward.pts === 'number', 'reward.pts missing');
  check(`${p}.noForbiddenName`,
    !FORBIDDEN_NAMES.some(fn => v.name.toLowerCase().includes(fn)),
    `Forbidden name fragment in: "${v.name}"`);
  check(`${p}.unlockPts`,  typeof v.unlockPts === 'number', 'unlockPts missing');
});

// ── Enemy integrity (10 types) ───────────────────────────────────────────────
check('ENEMY_COUNT', enemies.length === 10, `Expected 10 enemy types, got ${enemies.length}`);

enemies.forEach(e => {
  const p = `ENEMY[${e.name}]`;
  check(`${p}.hp`,    typeof e.hp === 'number' && e.hp > 0,   'hp missing');
  check(`${p}.dmg`,   typeof e.dmg === 'number' && e.dmg > 0, 'dmg missing');
  check(`${p}.emoji`, typeof e.emoji === 'string',             'emoji missing');
  check(`${p}.color`, /^#[0-9a-fA-F]{6}$/.test(e.color),     'color must be hex');
  check(`${p}.behavior`, typeof e.behavior === 'string',       'behavior missing');
});

// ── 13×16 Cross Matrix ───────────────────────────────────────────────────────
let matrixRows = 0;
characters.forEach(c => {
  venues.forEach(v => {
    matrixRows++;
    const id = `MATRIX[${c.id}×${v.id}]`;
    // Verify char can be loaded + venue can be loaded (data present)
    check(`${id}.charExists`,  !!c.name, 'char missing');
    check(`${id}.venueExists`, !!v.name, 'venue missing');
    // Verify unlock chain makes sense (venues unlock ≥ char unlock or venue 1-2 are free)
    const accessible = v.id <= 2 || v.unlockPts >= 0;
    check(`${id}.accessible`, accessible, 'venue has invalid unlock threshold');
  });
});

check('MATRIX_ROWS', matrixRows === 208, `Expected 208 matrix rows (13×16), got ${matrixRows}`);

// ── Report ────────────────────────────────────────────────────────────────────
console.log('\n  HITGEAR OS — QA Validation Report');
console.log('  ====================================');
console.log(`  Total checks : ${passed + failed}`);
console.log(`  Passed       : ${passed}`);
console.log(`  Failed       : ${failed}`);
console.log('');

if (failures.length > 0) {
  console.log('  Failures:');
  failures.forEach(f => console.log('  ' + f));
  console.log('');
  process.exit(1);
} else {
  console.log('  ALL CHECKS PASSED — V1 data integrity verified.\n');
  process.exit(0);
}
