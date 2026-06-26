# Venue backdrop art

Finished venue PNGs live here. The game auto-loads them (via `AssetLoader` +
`scene_manager` / `versus_engine`) and falls back to the built-in neon-vector
backdrops whenever a file is missing — nothing crashes if art isn't present.

## Wired backdrops (sliced from the uploaded venue packs)

| File                          | Venue (index.html)              | Source pack / sheet                         |
|-------------------------------|---------------------------------|---------------------------------------------|
| `kingdom_come_saloon.png`     | id:4 Kingdom Come Saloon (top)  | Kingdom Come Stage 2 — Sheet 08 interior    |
| `kingdom_come_exterior.png`   | story: Kingdom Come "Last Call" | Kingdom Come Stage 2 — Sheet 07 exterior    |
| `outta_interior.png`          | id:5 Social Gaines (sports-bar fit) | Outta Pocket — Sheet 08 interior hero   |
| `outta_exterior.png`          | Outta Pocket (its own separate venue) | Outta Pocket — Sheet 08 exterior hero |
| `tally_exterior.png`          | id:7 Tally Row Exterior (side)  | Tally Row — Sheet 02 brawler exterior       |
| `tally_den.png`               | id:8 The Den                    | Tally Row — Sheet 07 interior               |
| `tally_itus.png`              | id:9 The Itus Pizza             | Tally Row — Sheet 06 interior               |
| `tally_sammys.png`            | id:10 Sammys Stage              | Tally Row — Sheet 05 interior               |
| `tally_public_hall.png`       | id:11 Public Hall               | Tally Row — Sheet 04 interior               |
| `tally_13rave.png`            | id:12 13 Rave Club              | Tally Row — Sheet 03 interior               |
| `social_gaines.png`           | id:5 Social Gaines Bar          | Social Gaines — Sheet 05 outside finished design |
| `success.png`                 | id:6 Success (rooftop pool & bar) | Success — Sheet 08 rooftop finished design |
| `dukes_interior.png`          | id:13 Dukes & Dimes (fight stage bg) | Dukes & Dimes — Sheet 08 interior hero |
| `dukes_exterior.png`          | (spare exterior hero — not used as stage bg) | Dukes & Dimes — Sheet 08 exterior hero |
| `qhf_exterior.png`            | id:14 Quick Hit Fuel (side)     | Quick Hit Fuel — Sheet 01 night-sky backdrop|
| `cafe8fifty_exterior.png`     | id:1 Cafe8Fifty (side, Stage 1) | Stage 1 pack — Sheet 07 exterior finished design |
| `hvas_interior.png`           | id:3 HITMANS VIP After Spot     | Stage 1 pack — Sheet 08 interior finished design |

All 13 venues now have real backdrop art — no placeholders, no borrowed art.

## Prop cutouts

Two pipelines build the transparent prop cutouts under `props/<venue>/<mode>/`:

- **`tools/cut_props_labeled.py`** (preferred, precise): label-anchored cutter.
  Each pack sheet captions every prop in snake_case; the tool OCRs the caption,
  cuts the cell above it, tight-masks it, and saves a **named** cutout
  (`cafe8fifty_outside_dj_booth_main.png`) plus a `_manifest.json`. PropRenderer
  matches a venue's `props` names straight to these files. Used by Cafe8Fifty +
  HVAS (Stage 1); other venues are migrating to it.
- **`tools/slice_venue_props.py`** (legacy): CV blob segmentation → anonymous
  indexed cutouts. Still in use for venues not yet migrated.

The Stage 1 pack (10 sheets `ChatGPT Image Jun 18 ...`, renamed
`cafe8fifty_pack_01..04`, `hvas_pack_05..06`, finished `_07/_08`, route-test
`_09/_10`) is the source for both Stage 1 venues. Sheets 09/10 (route test) are
excluded; 07/08 (finished design) are the backdrop crops, not prop sources.
