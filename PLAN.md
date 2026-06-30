# HVAS — Complete Build Plan

Every layer the game needs, every venue, every menu. Execute top → bottom.

## A · Layer Inventory

### A1 · Characters (DONE)
- 19 fighters: creator(1), dj(2), famu_female(3), famu_male(4), influencer(5),
  photographer(6), promoter(7), dancer(8), vendor(9), security(10), host(11),
  fsu_female(12), fsu_male(13), kendrick(14), kt(20), big_soulja(21), eld(22),
  predator_pete(30), agent_snow(31)
- 6 sheets/char × ~48 frames = **5,472 frames sliced** ✅
- Anim map: loco / combat / damage / supers / topdown / vfx ✅

### A2 · Menus (DONE)
- BootScene, PreloadScene ✅
- MainMenu (clean panels) ✅
- CharacterSelect (all 19 sprites animate) ✅
- ArcadeVs (select + VS screen + countdown + fight) ✅
- StageSelect (7 quest stages) ✅
- VenueSelect (12 indoor venues) ✅
- OptionsScene ✅
- PauseMenu (in BrawlerScene) ✅
- HUD (health/super/round bars, combo counter) ✅
- Dialogue panel (VenueScene) ✅

### A3 · Stage 1 — Cafe8Fifty (sliced, layout written, NOT wired)
- Exterior: 82 tiles ✅ sliced; 47-tile layout written; **not wired**
- Interior (Hitmans VIP After Spot): 40 tiles ✅ sliced; **no layout yet**

### A4 · Stage 2 — Duke's (4 packs, not sliced)
- dukes_pack_01_assets · _04_components_a · _05_components_b · _07_exterior_bg · _08_interior_bg
- Exterior + interior

### A5 · Stage 3 — Kingdom Come Saloon / KCS (7 packs, not sliced)
- _01_assets · _02_patio_assets · _03_exterior_components · _04_interior_bar · _05_interior_stage · _06_props_signs · _08_interior_bg
- Exterior + patio + interior_bar + interior_stage

### A6 · Stage 4 — Outta Pocket (3 packs, not sliced)
- _01_assets · _04_bar_pool · _05_components_a
- Exterior + interior (bar+pool)

### A7 · Stage 5 — Quick Hit Fuel / QHF (4 packs, not sliced)
- _01_assets · _03_store_interior · _05_components_a · _07_exterior_bg
- Exterior + store interior

### A8 · Stage 6 — Social Gaines (4 packs, not sliced)
- _01_facade · _02_floor_tiles · _03_signage_props · _06_interior
- Exterior + interior

### A9 · Stage 7 — Tally Row (1 exterior + 5 indoor venues, 18 packs total, not sliced)
- Exterior: tally_pack_01_assets · _02_exterior_stage
- Public Hall: tally_pack_03_public_hall · tally_public_hall_pack_02_interior_a · _03_interior_b
- Sammy's: tally_pack_04_sammys · tally_sammys_pack_02_interior_a · _03_assembly_guide
- 13Rave: tally_pack_05_13rave · tally_13rave_pack_02_interior_a · _03_interior_b
- The Den: tally_pack_06_den · tally_den_pack_02_interior_a · _03_interior_b · _04_interior_c
- Itus: tally_pack_07_itus · tally_itus_pack_02_interior_a · _03_interior_b

### A10 · Bonus — Success Rooftop (2 packs, not sliced)
- success_pack_01_rooftop_core · _03_props_signage

### A11 · Standing rules (long-term)
- Multiplayer Quest/Venue layer (presence, chat, mesh) — NOT STARTED
- HitKoin currency — NOT STARTED
- Higgy deployment (shareable URL) — BLOCKED on dist size

## B · Execution Phases

### Phase 1 — Wire Cafe8Fifty composer (5 min)
Replace `StageLoader.loadBackdrop()` in BrawlerScene with `TileComposer.compose()`.
Verify the cafe8fifty stage renders from 47 tiles instead of the baked PNG.

### Phase 2 — Slice all remaining venue packs (~30-45 min)
Write a generic slicer driven by a per-pack manifest. Process all 36 remaining
pack sheets to extract every modular tile.

### Phase 3 — Write tile layouts for each venue (~1-2 hours)
For each of these venues, write a layout file with tile placements:
- HVAS interior (top-down, indoor)
- Dukes exterior + interior
- KCS exterior + patio + interior
- Outta exterior + interior
- QHF exterior + interior
- Social Gaines exterior + interior
- Success Rooftop
- Tally exterior + 5 indoor venues

### Phase 4 — Wire composers into scenes
- BrawlerScene loads exterior layout based on stage.id
- VenueScene loads interior layout based on venue.id
- Drop the pre-composited backdrops once tiles match

### Phase 5 — End-to-end verification
- Drive every scene with Playwright
- Capture screenshots, compare to reference layouts
- Fix any tile misalignments

### Phase 6 — Standing-rule deliverables (later sessions)
- Multiplayer presence + chat layer
- HitKoin currency
- Higgy deploy

---

## Status (live)
Updated as work progresses.
