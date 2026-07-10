# HITMANS VIP — Roster, Story & Asset Upgrade Plan

Owner granted full control to use the real fighters, rewrite the story for
them, and remake/edit sprite sheets, VFX, characters, venues, tiles, doors,
and props. This doc is the running plan for that work.

## 1. The real roster (19 fighters, from `assets/characters/frames/`)

### Playable crew — "who you are tonight" (13, clean chibi art)
| id | Fighter | Night identity | Strength | Weakness |
|----|---------|----------------|----------|----------|
| creator | The Creator | Builds the scene — content, community, the whole movement | Networking, influence, event bonuses | Weaker street combat early |
| dj | The DJ | Controls the vibe and the room's energy | Audio/VFX crowd boosts | Limited street combat |
| promoter | The Promoter | Guest list, invites, filling the spot | Referrals, crowd pull | Soft in a fight early |
| dancer | The Dancer | Owns the floor, runs up the hype | Dance/mini-games, charisma | Low defense |
| host | The Host / MC | Runs the room and the games | Mini-game + dialogue bonuses | Mid combat |
| photographer | The Lens | Captures the night, builds social proof | Marketing/reputation missions | Fragile in fights |
| vendor | The Vendor | Sells food/merch/services all night | Money + item bonuses | Low special meter |
| security | Security | Keeps the peace, clears bad actors | Combat, block, crowd control | Slow networking growth |
| influencer | The Influencer | Reach and clout, moves the timeline | Reputation, viral missions | Needs protection from opps |
| famu_female | FAMU Student (F) | Campus-to-club, building her circle | Fast growth, social missions | Low starting money/status |
| famu_male | FAMU Student (M) | Campus-to-club, making his name | Fast growth, social missions | Low starting money/status |
| fsu_female | FSU Student (F) | New to the scene, learning the night | Fast growth, social missions | Low starting money/status |
| fsu_male | FSU Student (M) | New to the scene, chasing status | Fast growth, social missions | Low starting money/status |

### Story / boss tier — encountered, not (yet) picked (6, named)
| id | Fighter | Role in the story |
|----|---------|-------------------|
| big_soulja | Big Soulja | Heavy-hitter presence on the route — power ally or wall depending on your standing |
| eld | Entry Line Disruptor (ELD) | Works the line, stirs the crowd — a recurring problem to handle |
| predator_pete | Predator Pete | A rival boss — parking-lot/rooftop danger |
| agent_snow | Agent Snow | Late-night boss — the final pressure before the 2AM return |
| kendrick | Kendrick | Named story figure — art needs remaster (see Errors) |
| kt | KT | Named story figure — art needs remaster (see Errors) |

## 2. Story rewrite (built around the real crew)

The player picks a **crew** fighter and comes out for the night. The class
you pick reframes the whole run: a Promoter fills the guest list, a Vendor
chases sales, Security clears opps, the DJ powers rooms. The named tier
(Big Soulja, ELD, Predator Pete, Agent Snow, Kendrick, KT) are the allies,
rivals, and bosses you meet on the route.

- **Act 1 — Cafe8Fifty (pre-game):** link with your crew, learn the
  membership path into HITMANS VIP, hit your first problem (ELD working the
  line).
- **Act 2 — Tally nightlife route:** street brawler between venues, top-down
  inside; your class dictates the mission type. Big Soulja shows up as a
  standing-based ally/wall.
- **Act 3 — Tally Row (multi-level):** crowds, rivals, status checks.
- **Act 4 — Social Gaines → Success (upstairs):** higher-status missions,
  Predator Pete as a rival boss.
- **Act 5 — The 2AM return:** Agent Snow is the final pressure; make it back
  to HITMANS VIP for the after spot. Success scored on status, money,
  relationships, and mission progress.

## 3. Errors found (asset QA)

- **`kendrick` idle/loco frames — CUT BAD.** Left at full 131×148 cell (not
  auto-cropped): a design-sheet UI bracket bleeds into frame 0, an adjacent
  cell's head pokes in from below, and crop heights are inconsistent
  (148 vs 126) — the slice grid is misaligned for this sheet.
- **`kt` idle/loco frames — CUT BAD + off-model.** Full-cell 131×148 with a
  black bar on frame 0's left edge; also a realistic render style that does
  not match the chibi roster, and not cleanly transparent.
- **Style outliers:** kendrick + kt are realistic vs the 17 chibi fighters —
  need either a chibi remaster or a deliberate "boss realism" treatment.
- **Suspected systematic:** owner reports "some are cut bad" generally — the
  per-sheet slice audit below must cover every animation row, not just idle.

## 4. Upgrade roadmap (full-control mandate)

1. **Frame-cut QA pass** — run/extend `tools/scan_label_leaks.py` + an
   auto-crop/registration checker across all 19 fighters × 6 sheets; flag any
   frame left at full cell size or with adjacent-cell bleed. Re-slice offenders
   with corrected offsets via the adaptive masker (not fixed grid).
2. **Remaster kendrick + kt** — re-slice cleanly; decide chibi-match vs
   boss-realism; regenerate if source is unrecoverable (budget-aware).
3. **Animation/VFX upgrade** — verify combat/supers/vfx rows per fighter play
   on-model (no drift/foot-slide) using the `ai-animation-debug-fix` skill.
4. **Venues** — finish slicing + tile layouts + wiring for all venues
   (Dukes/KCS/Social Gaines have tiles; Outta/QHF/Tally/Success need slicing),
   including doors, props, and collision.
5. **Wire into the app shell** — Character Select (this pass) → GameCanvas
   mount → Cafe8Fifty street brawler (A/B/X/Y) → HITMANS door → top-down
   inside → check-in → district map.

## 5. Status
- [x] Real roster imported into Character Select (13 playable portraits).
- [x] Story rewritten around the real crew + named tier.
- [x] kendrick/kt errors logged; shown locked (not rendered broken).
- [ ] Frame-cut QA pass across all sheets.
- [ ] kendrick/kt remaster.
- [ ] Phaser game embed.
