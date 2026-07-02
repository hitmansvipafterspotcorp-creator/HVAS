---
name: Top-Down Venue Networking
description: Build Pokémon-style top-down venue navigation: NPC talk, doors, networking quests, interiors, rewards, and route graph.
---

## Mission
Use this skill when building inside-venue gameplay: top-down movement, NPC networking, door transitions, challenge prompts, private-member check-in, rewards, and venue graph routing.

## Required Venue Gameplay
- Four-direction top-down movement.
- Collision with walls, bars, booths, counters, tables, stage, pools, bathrooms, and doors.
- NPC talk bubbles and choice prompts.
- Random networking encounters like Pokémon-style trainer/challenge interactions.
- Door hotspots connecting rooms and outside brawler stages.
- Venue-specific rewards and unlocks.

## Venue Graph Shape
```json
{
  "id": "hitmans_vip_interior",
  "mode": "top_down",
  "doors": [
    { "id": "front_exit", "to": "cafe8fifty_exterior", "spawn": "front_door" },
    { "id": "dj_booth", "to": "host_tools", "spawn": "booth_front" }
  ],
  "npcs": [
    { "id": "dj", "role": "DJ", "x": 420, "y": 220, "dialogue": "Want to call the next song?" }
  ],
  "encounters": [
    { "id": "networking_challenge", "chance": 0.15, "reward": "contact_card" }
  ]
}
```

## NPC Interaction Rules
- Interaction uses depth/overlap and facing direction.
- NPC text must pause player movement only while dialogue is open.
- Choices can trigger rewards, battles, music permission screens, bingo registration, or route unlocks.
- Networking outcomes should be logged in save data.

## Acceptance Criteria
- Player can walk inside a venue.
- Doors route to correct stages.
- NPCs can talk and trigger choices.
- Encounters and rewards work from JSON.
- Inside mode can hand off to outside brawler mode.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.
