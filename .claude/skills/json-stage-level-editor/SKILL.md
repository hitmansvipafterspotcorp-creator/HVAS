---
name: JSON Stage Level Editor
description: Author Phaser brawler stages as JSON with modular panels, tiling sky, doors, props, hotspots, waves, and collisions.
---

## Mission
Use this skill when the user wants stages authored as data, not hardcoded scenes. Build or update an in-engine level editor that writes JSON for modular brawler backgrounds, top-down interiors, props, collisions, hotspots, doors, waves, and bosses.

## Stage JSON Schema Concept
```json
{
  "id": "cafe8fifty_exterior",
  "name": "Café8Fifty Exterior",
  "mode": "brawler",
  "size": { "width": 2400, "height": 720 },
  "camera": { "startX": 0, "lockZones": [] },
  "sky": { "texture": "night_sky", "tileX": true, "scrollFactor": 0.2 },
  "layers": [
    { "id": "back", "parallax": 0.35, "items": [] },
    { "id": "mid", "parallax": 0.7, "items": [] },
    { "id": "floor", "parallax": 1, "items": [] },
    { "id": "front", "parallax": 1.1, "items": [] }
  ],
  "collisions": [],
  "hotspots": [],
  "props": [],
  "waves": []
}
```

## Editor Tools Required
- Select asset panel
- Place item
- Move/scale/flip item
- Snap to grid
- Layer assignment
- Collision rectangle draw/edit
- Hotspot draw/edit
- Wave zone draw/edit
- Export JSON
- Import JSON
- Validate missing textures

## Modular Panel Rules
- Make sky tile horizontally.
- Keep floor panels aligned to the same ground baseline.
- Keep doors and hotspots named by destination stage id.
- Keep props separate from background art so they can be destructible.
- Place garage doors, bars, booths, counters, walls, signs, lights, and stage pieces as individual JSON items when possible.

## Hotspot Types
```text
enter_stage
exit_stage
talk_npc
start_wave
pickup_weapon
open_door
boss_trigger
shop
check_in
music_permission
```

## Acceptance Criteria
- A non-coder can move panels and export JSON.
- The game loads the JSON without code changes.
- Missing textures show a clear debug placeholder.
- Hotspots can move the player between outside brawler and inside top-down venue mode.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.
