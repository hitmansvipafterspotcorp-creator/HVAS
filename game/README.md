# HVAS Engine — Phaser 4.1.0 + TypeScript

Ground-up rebuild of HITMANS VIP AFTER SPOT as a real game engine, per the
master rebuild prompt. Built alongside the existing vanilla-JS app (which stays
intact in the repo root) so approved assets and the HITGEAR shell are never
deleted — they get migrated into this engine scene by scene.

## Run it

```bash
cd game
npm install
npm run dev        # http://localhost:5173  (live reload)
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # serve the production build
```

Desktop controls: **Arrow keys / WASD** move (8-way, x + depth), **J** attack,
**K** super, **Shift** dodge, **F1** debug overlay, **ESC** back to menu.

## Architecture

```
src/
  main.ts                 Phaser.Game bootstrap (Scale.FIT, arcade physics)
  config.ts               All 2.5D math constants + scene keys + palette
  scenes/
    BootScene.ts          crash-proof first frame
    PreloadScene.ts       animated logo splash + load bar
    MainMenuScene.ts      HITGEAR hub; QUEST -> Brawler, others COMING SOON
    BrawlerScene.ts       playable Streets-of-Rage graybox
  entities/
    Fighter.ts            graybox body + floor shadow = true feet/depth
  systems/
    InputSystem.ts        logical buttons (keyboard now; touch/pad later)
    DepthGateSystem.ts    THE 2.5D rule: X overlap AND feet-lane overlap
    CombatSystem.ts       damage, hit-stop, shake, sparks, combo, meter, super
    EnemyAISystem.ts      crowd-control flocking (one attacker token + circling)
    WaveSystem.ts         camera-locked, data-driven enemy waves
```

## What works now (verified headless)

- App boots Boot → Preload → MainMenu with **zero console errors**.
- Brawler: player moves 8-way, attacks, lands hits (meter fills, enemies KO).
- **Real character sprites** wired over the graybox: player + enemies use the
  pre-sliced 131×181 frames from `assets/characters/frames/` via AnimationSystem
  (idle/walk/combo1-3/hurt/knockdown/defeated/supers).
- **Depth gate verified**: in-lane attacks connect, wrong-lane attacks miss.
- Two-way combat: enemies rush/circle and damage the player.
- Camera-locked waves (3 waves) with HUD (HP / SUPER / COMBO / WAVE).
- MvC-style super at full meter (screen flash + lane-wide hit).
- F1 debug overlay: floor band, feet contact points, hurt spans, attack reach.
- **Top-down VenueScene** (Hitmans VIP After Spot interior), JSON-authored:
  player walks 8-way with td_ sprites, talks to NPCs (DialogueSystem), uses
  doors/hotspots (InteractionSystem). A door routes to the Cafe8Fifty streets
  (Brawler). New venues are pure data (`src/data/venues/*.json`).

## Asset pipeline

- `src/data/animMap.ts` — uniform frame layout for all 19 fighters.
- `AnimationSystem` lazily loads only the frames a mode needs and builds Phaser
  anims globally (reused across scenes). Missing frames are skipped so a
  partially-sliced character (e.g. pete/snow top-down) still gets a playable
  fallback instead of breaking the build.
- Venue interior backdrop is probed optionally — drop
  `assets/venues/hitmans_vip_inside.png` and it appears automatically.

## Next passes (priority order from the master prompt)

- G. StageLoader + JSON stage schema + AssetManifestLoader (extends venue JSON)
- I. WeaponSystem (bat pickup) + PropDestructionSystem + drops
- J. BossSystem + garage-door reveal cutscene
- K. LevelEditorScene
- Bingo / TV / Host scenes ported from the existing vanilla-JS modules
- Polish: top-down sprite scale/label spacing, real venue backdrops
