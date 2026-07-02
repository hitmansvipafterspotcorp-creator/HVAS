---
name: fal AI Image Source Designs
description: Generate consistent game-ready source designs with fal image APIs for sprites, bosses, props, VFX, and stage panels.
---

## Mission
Use this skill when the user wants fal.ai image generation to create consistent source designs for characters, bosses, props, stage panels, pickup weapons, UI elements, or hit VFX before animation.

## Required Behavior
- Treat fal as the source-design generator, not the final animation cutter.
- Create anchor images with clear silhouette, fixed costume, fixed palette, and stable proportions.
- Make assets game-readable: transparent background when possible, full body visible, feet visible, no crop cuts.
- Generate designs before animation. Do not animate off-model concepts.

## fal Integration Rules
- Use the JavaScript SDK `@fal-ai/client` or Python `fal_client`.
- Read `FAL_KEY` from the environment.
- Never paste or store the actual key.
- Pick current fal image endpoints by checking the project’s model registry or user-approved endpoint list.
- Prefer image-generation/editing endpoints for character anchors and asset cleanup.

## Source Design Prompt Template
```text
Create a game-ready source design for [SUBJECT].
Style: high-energy 2D arcade brawler, clean readable silhouette, nightlife black/purple/gold/pink palette, bold outlines, full body, feet visible, hands visible.
Camera: straight-on side-view / 3-quarter game character view.
Output: transparent background if supported, no text, no watermark, no cropped limbs.
Consistency lock: same face, same outfit, same shoes, same proportions, same emblem placement.
Use: Phaser 4.1.0 brawler sprite anchor and animation reference.
```

## Character Anchor Checklist
- Full body from head to shoes
- Neutral idle stance
- Feet on same floor line
- Hands visible
- No duplicate limbs
- No weapons unless requested
- Costume/emblem readable
- Transparent or easy-to-cut background
- No text baked into the character unless it is an approved emblem

## Stage Panel Prompt Template
```text
Create a modular 2D brawler background panel for [VENUE AREA].
Use: Phaser side-scrolling brawler stage JSON panel.
Camera: straight-on side view with floor plane visible.
Panel type: [wall / door / bar / booth / sign / sidewalk / skyline / garage door / prop].
Style: realistic nightlife arcade, black/purple/gold/pink lighting, no characters, no watermark.
Output: tileable edges where applicable, clean perspective, readable collision boundaries.
```

## Output Naming
```text
assets/source-designs/characters/[character_id]/anchor_front.png
assets/source-designs/characters/[character_id]/anchor_side.png
assets/source-designs/venues/[stage_id]/panel_[type]_[number].png
assets/source-designs/vfx/[vfx_id]/anchor.png
```

## Acceptance Criteria
- The output is clean enough to become an animation anchor.
- The design is not cropped.
- A second prompt can reuse the same character without changing identity.
- Stage panels can be placed in JSON without obvious perspective mismatch.

## Security and API Rules
- Never hardcode API keys, tokens, passwords, private URLs, wallet secrets, or credentials into generated code.
- Use environment variables such as `FAL_KEY` or `.env.local` placeholders only.
- Before writing files, inspect the project tree and preserve existing user assets.
- Keep generated code deterministic, testable, and reversible.
- Ask for approval before deleting, overwriting, or mass-renaming production assets.
