---
name: ElevenLabs Audio SFX
description: Plan and wire voice, music, stingers, crowd reactions, and SFX cues for Phaser brawler and venue scenes.
---

## Mission
Use this skill when the user wants voice, music, crowd reactions, callouts, host lines, SFX, or cinematic audio cues for the Phaser brawler and venue app. ElevenLabs or another approved audio provider can create source audio, but the game must use optimized local assets at runtime.

## Audio Categories
```text
voice/host_callouts
voice/boss_lines
music/stage_loops
music/boss_intro
sfx/hit_light
sfx/hit_heavy
sfx/super_flash
sfx/door_rumble
sfx/prop_break
sfx/heart_pickup
crowd/cheer
crowd/boo
```

## Integration Rules
- Keep source WAV/MP3 separate from compressed game assets.
- Normalize loudness per category.
- Use short SFX for combat readability.
- Avoid long voice lines during active combat unless they are boss intro/cutscene lines.
- Music loops must have loop points documented.

## Phaser Audio Manifest
```json
{
  "music": [{ "id": "cafe8fifty_loop", "url": "assets/audio/music/cafe8fifty_loop.mp3", "loop": true }],
  "sfx": [{ "id": "hit_heavy", "url": "assets/audio/sfx/hit_heavy.wav", "volume": 0.85 }],
  "voice": [{ "id": "boss_intro_kt", "url": "assets/audio/voice/boss_intro_kt.mp3", "subtitle": "You made it to the door." }]
}
```

## Acceptance Criteria
- Combat audio is responsive and not delayed.
- Cutscene audio syncs with reveals.
- Host/DJ voice lines do not conflict with music permission rules.
- All generated audio is referenced by manifest, not hardcoded paths.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.
