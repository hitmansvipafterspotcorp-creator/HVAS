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
| `dukes_interior.png`          | id:13 Dukes & Dimes (fight stage bg) | Dukes & Dimes — Sheet 08 interior hero |
| `dukes_exterior.png`          | (spare exterior hero — not used as stage bg) | Dukes & Dimes — Sheet 08 exterior hero |
| `qhf_exterior.png`            | id:14 Quick Hit Fuel (side)     | Quick Hit Fuel — Sheet 01 night-sky backdrop|

## STILL NEEDED — venue renders not present in the repo

These venues are distinct and must NOT borrow Outta Pocket art (Outta Pocket is
its own separate venue). The wrong Outta-Pocket placeholder copies that were
previously sitting in `cafe8fifty_exterior.png` / `hvas_interior.png` have been
removed. Drop a finished render in here with the exact filename and it lights up
automatically — no code changes.

| Needed file                   | Venue                                                |
|-------------------------------|------------------------------------------------------|
| `cafe8fifty_exterior.png`     | id:1 Cafe8Fifty — neon-lit street front (stage 1)    |
| `hvas_interior.png`           | id:3 HITMANS VIP After Spot — VIP club interior      |
| `social_gaines.png`           | id:5 Social Gaines Bar — sports bar interior (pool tables, big screens) — NOT Outta Pocket |
| `success_pool.png`            | id:6 Success Pool — ROOFTOP swimming-pool bar (pool, tiki bar, cabanas, palm trees) — NOT a billiards hall |

Only the Cafe8Fifty / HVAS NPC *character* sheets exist in the repo; no
background pack for these three venues was uploaded.
