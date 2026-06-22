# Venue backdrop art

Finished venue PNGs live here. The game auto-loads them (via `AssetLoader` +
`scene_manager` / `versus_engine`) and falls back to the built-in neon-vector
backdrops whenever a file is missing — nothing crashes if art isn't present.

## Wired backdrops (sliced from the uploaded venue packs)

| File                          | Venue (index.html)              | Source pack / sheet                         |
|-------------------------------|---------------------------------|---------------------------------------------|
| `kingdom_come_saloon.png`     | id:4 Kingdom Come Saloon (top)  | Kingdom Come Stage 2 — Sheet 08 interior    |
| `kingdom_come_exterior.png`   | story: Kingdom Come "Last Call" | Kingdom Come Stage 2 — Sheet 07 exterior    |
| `outta_interior.png`          | id:5 Social Gaines, id:6 Success Pool | Outta Pocket — Sheet 08 interior hero |
| `outta_exterior.png`          | (spare exterior hero)           | Outta Pocket — Sheet 08 exterior hero       |
| `tally_exterior.png`          | id:7 Tally Row Exterior (side)  | Tally Row — Sheet 02 brawler exterior       |
| `tally_den.png`               | id:8 The Den                    | Tally Row — Sheet 07 interior               |
| `tally_itus.png`              | id:9 The Itus Pizza             | Tally Row — Sheet 06 interior               |
| `tally_sammys.png`            | id:10 Sammys Stage              | Tally Row — Sheet 05 interior               |
| `tally_public_hall.png`       | id:11 Public Hall               | Tally Row — Sheet 04 interior               |
| `tally_13rave.png`            | id:12 13 Rave Club              | Tally Row — Sheet 03 interior               |
| `dukes_interior.png`          | id:13 Dukes & Dimes             | Dukes & Dimes — Sheet 08 interior hero      |
| `dukes_exterior.png`          | (spare exterior hero)           | Dukes & Dimes — Sheet 08 exterior hero      |
| `qhf_exterior.png`            | id:14 Quick Hit Fuel (side)     | Quick Hit Fuel — Sheet 01 night-sky backdrop|

## STILL NEEDED — Stage 1 (Cafe 8Fifty / HITMANS VIP AFTER SPOT)

These two are referenced by the home venues + the final boss gauntlet but the
**Cafe 8Fifty Stage 1 venue pack was not found in the repo** (only the KT /
Cafe8Fifty NPC *character* sheets are here). Until they're uploaded, those
venues run on the neon-vector fallback.

| Needed file                   | Used by                                              |
|-------------------------------|------------------------------------------------------|
| `cafe8fifty_exterior.png`     | id:1 Cafe 8Fifty, story: The Door (ELD), HVAS (Soulja)|
| `hvas_interior.png`           | id:3 HVAS interior, story: KT final boss             |

Drop a finished Cafe 8Fifty exterior render + an HVAS interior render in here
with those exact names and they light up automatically — no code changes.
