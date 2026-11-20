# Lip Sync Bingo — Track Audit, Nov 20, 2026

Korey's order: *"I need this shit perfect bro. Every single playlist and set we got
for the cards I need you to have all the songs."*

## Method

- Every primary `yt` ID (110/110) checked against the YouTube oEmbed endpoint
  (`youtube.com/oembed?url=...watch?v=<ID>`): HTTP 200 = video exists and allows
  embedding. All 110 returned 200, and each returned video title was cross-checked
  against the pool's artist/title so no ID points at the wrong song.
- A backup upload (`yt2`) was found for every song via yt-dlp search
  (official video → official audio → Topic upload, in that preference order),
  cross-checked by artist+title, then oEmbed-verified the same way.
- The player (js/app.js) now uses the YouTube IFrame Player API: it only shows
  "Track playing" after YouTube reports PLAYING, auto-falls back to `yt2` on
  embed errors (2/5/100/101/150), and links out to YouTube if both fail.

## Results

- **110/110 songs have a verified-embeddable primary track (`yt`).**
- **109/110 songs also have a verified backup track (`yt2`).**
- **1 primary replaced:** `slow-down` (Smino) pointed at *LOW DOWN DERRTY BLUES* —
  the wrong song. It now points at Smino's official *Slow It Down* upload
  (`f36Ldh__CNw`). Note: the pool title says "Slow Down"; the official track
  title is "Slow It Down". No second upload of it exists, so it is the one
  song without a `yt2` backup.
- 1 first-choice backup (Blackstreet — No Diggity, a fan re-upload) failed
  oEmbed with 401 and was replaced with the official BLACKstreet album upload.

## Song-by-song audit

| # | Song | Artist | yt (primary) | yt status | yt2 (backup) | yt2 status |
|---|------|--------|--------------|-----------|--------------|------------|
| 1 | Uptown Funk | Bruno Mars | `OPf0YbXqDm0` | verified (oEmbed 200) | `7Ya2U8XN_Zw` | verified (oEmbed 200) |
| 2 | A Milli | Lil Wayne | `1Vf4mMCpNY0` | verified (oEmbed 200) | `w81Eci5bkXc` | verified (oEmbed 200) |
| 3 | Up | Cardi B | `rCiBgLOcuKU` | verified (oEmbed 200) | `N2LPTvuIQ5U` | verified (oEmbed 200) |
| 4 | Cuff It | Beyoncé | `yrtWLyp5gLI` | verified (oEmbed 200) | `SjqmSPZhF3s` | verified (oEmbed 200) |
| 5 | Super Bass | Nicki Minaj | `4JipHEz53sU` | verified (oEmbed 200) | `aFwmvQ1pSEc` | verified (oEmbed 200) |
| 6 | Work | Rihanna | `HL1UzIK-flA` | verified (oEmbed 200) | `puxjq3p-fU0` | verified (oEmbed 200) |
| 7 | Rock The Boat | Aaliyah | `3HSJU5fDg0A` | verified (oEmbed 200) | `QOgEy06B-FY` | verified (oEmbed 200) |
| 8 | I Wanna Dance With Somebody | Whitney Houston | `eH3giaIzONA` | verified (oEmbed 200) | `OnZmC6B06Kk` | verified (oEmbed 200) |
| 9 | Big Energy | Latto | `T8GpG8C0YzA` | verified (oEmbed 200) | `WoIyBnyR_fA` | verified (oEmbed 200) |
| 10 | Mask Off | Future | `xvZqHgFz51I` | verified (oEmbed 200) | `aWb8z-KhZdo` | verified (oEmbed 200) |
| 11 | No Scrubs | TLC | `FrLequ6dUdM` | verified (oEmbed 200) | `rmOd7z8Edrg` | verified (oEmbed 200) |
| 12 | Buy U A Drank | T-Pain | `dBrRBZy8OTs` | verified (oEmbed 200) | `Phx1k2mWWZI` | verified (oEmbed 200) |
| 13 | Family Affair | Mary J. Blige | `znlFu_lemsU` | verified (oEmbed 200) | `BiucBz4wEak` | verified (oEmbed 200) |
| 14 | Tomorrow 2 | GloRilla | `zwa7NzNBQig` | verified (oEmbed 200) | `RfNHylx7qtA` | verified (oEmbed 200) |
| 15 | Yeah! | Usher | `GxBSyx85Kp8` | verified (oEmbed 200) | `Ifu6TZnytlU` | verified (oEmbed 200) |
| 16 | Bad and Boujee | Migos | `S-sJp1FfG7Q` | verified (oEmbed 200) | `DdFqRssN_Ys` | verified (oEmbed 200) |
| 17 | No Flockin | Kodak Black | `UE_-obgiWm0` | verified (oEmbed 200) | `yw-1dAdgID0` | verified (oEmbed 200) |
| 18 | Nice For What | Drake | `U9BwWKXjVaI` | verified (oEmbed 200) | `OZXrgCCzVu4` | verified (oEmbed 200) |
| 19 | Never Too Much | Luther Vandross | `pNj9bXKGOiI` | verified (oEmbed 200) | `bNdIST6oPl4` | verified (oEmbed 200) |
| 20 | Aston Martin Music | Rick Ross | `a35rNEBNiO4` | verified (oEmbed 200) | `DejyySJcbZA` | verified (oEmbed 200) |
| 21 | Crazy In Love | Beyoncé | `ViwtNLUqkMY` | verified (oEmbed 200) | `XKeUvUhxBCg` | verified (oEmbed 200) |
| 22 | Kill Bill | SZA | `MSRcC626prw` | verified (oEmbed 200) | `SQnc1QibapQ` | verified (oEmbed 200) |
| 23 | Hey Ya! | Outkast | `PWgvGjAhvIw` | verified (oEmbed 200) | `JzqYDWBkX_Q` | verified (oEmbed 200) |
| 24 | 1, 2 Step | Ciara | `iBHNgV6_znU` | verified (oEmbed 200) | `ZboXfvvxWls` | verified (oEmbed 200) |
| 25 | Hotline Bling | Drake | `uxpDa-c-4Mc` | verified (oEmbed 200) | `zt6aRKpf9T4` | verified (oEmbed 200) |
| 26 | HUMBLE. | Kendrick Lamar | `tvTRZJ-4EyI` | verified (oEmbed 200) | `ov4WobPqoSA` | verified (oEmbed 200) |
| 27 | Tití Me Preguntó | Bad Bunny | `Cr8K88UcO0s` | verified (oEmbed 200) | `qBUKfQRbzuk` | verified (oEmbed 200) |
| 28 | Say So | Doja Cat | `pok8H_KF1FA` | verified (oEmbed 200) | `uAYG46w1SCA` | verified (oEmbed 200) |
| 29 | EARFQUAKE | Tyler, The Creator | `HmAsUQEFYGI` | verified (oEmbed 200) | `Oo3wu3wx1i8` | verified (oEmbed 200) |
| 30 | WAP | Cardi B | `hsm4poTWjMs` | verified (oEmbed 200) | `Wc5IbN4xw70` | verified (oEmbed 200) |
| 31 | Drip Too Hard | Lil Baby & Gunna | `_YzD9KW82sk` | verified (oEmbed 200) | `THcVOf1kNh0` | verified (oEmbed 200) |
| 32 | pushin P | Gunna | `9g08kucPQtE` | verified (oEmbed 200) | `-705T4FioZE` | verified (oEmbed 200) |
| 33 | Tick Tock | Young Thug | `sxfr4RooJkI` | verified (oEmbed 200) | `3M9HDjbd01w` | verified (oEmbed 200) |
| 34 | XO TOUR Llif3 | Lil Uzi Vert | `WrsFXgQk5UI` | verified (oEmbed 200) | `VcyFfcJbyeM` | verified (oEmbed 200) |
| 35 | SICKO MODE | Travis Scott | `6ONRf7h3Mdk` | verified (oEmbed 200) | `HNMuFjl5FTo` | verified (oEmbed 200) |
| 36 | rockstar | Post Malone | `UceaB4D0jpo` | verified (oEmbed 200) | `4GFAZBKZVJY` | verified (oEmbed 200) |
| 37 | Savage | Megan Thee Stallion | `EOxj2ROIxok` | verified (oEmbed 200) | `eJEKHdvntPI` | verified (oEmbed 200) |
| 38 | Act Up | City Girls | `F_VsAvS1kuo` | verified (oEmbed 200) | `UrfIZgAfhAM` | verified (oEmbed 200) |
| 39 | ROCKSTAR | DaBaby | `83xBPCw5hh4` | verified (oEmbed 200) | `dmcUUgBsITU` | verified (oEmbed 200) |
| 40 | The Box | Roddy Ricch | `UNZqm3dxd2w` | verified (oEmbed 200) | `uLHqpjW3aDs` | verified (oEmbed 200) |
| 41 | WHATS POPPIN | Jack Harlow | `HIwAI05Y1fU` | verified (oEmbed 200) | `EzrM9RJnAhA` | verified (oEmbed 200) |
| 42 | Pop Out | Polo G | `g-uW3I_AtDE` | verified (oEmbed 200) | `o70FKH6n8LE` | verified (oEmbed 200) |
| 43 | Shotta Flow | NLE Choppa | `3W0e7aI0gAg` | verified (oEmbed 200) | `BUJ_hyOMIq8` | verified (oEmbed 200) |
| 44 | Said Sum | Moneybagg Yo | `T8pi91qWnRw` | verified (oEmbed 200) | `EGayfVfvVW8` | verified (oEmbed 200) |
| 45 | One Man Can Change the World | Big Sean | `GBVotNefYME` | verified (oEmbed 200) | `MDit3OcIh58` | verified (oEmbed 200) |
| 46 | No Problem | Chance the Rapper | `DVkkYlQNmbc` | verified (oEmbed 200) | `wJMARZrSXso` | verified (oEmbed 200) |
| 47 | The Need To Know | Wale | `YyEbAoFrYtg` | verified (oEmbed 200) | `H-02Wi0uc8k` | verified (oEmbed 200) |
| 48 | No Role Modelz | J. Cole | `8HBcV0MtAQg` | verified (oEmbed 200) | `L6L4T3hwmQA` | verified (oEmbed 200) |
| 49 | Exchange | Bryson Tiller | `aj9coPGuFkM` | verified (oEmbed 200) | `iOpJywrdCuQ` | verified (oEmbed 200) |
| 50 | Gravity | Brent Faiyaz | `FBM4cdml6Qs` | verified (oEmbed 200) | `3MtoSSfnhMc` | verified (oEmbed 200) |
| 51 | Playing Games | Summer Walker | `SDSXLkD74KE` | verified (oEmbed 200) | `o_6HGBsMHeA` | verified (oEmbed 200) |
| 52 | Roll Some Mo' | Lucky Daye | `6WXmaJcguXo` | verified (oEmbed 200) | `S0KW2GD0MOg` | verified (oEmbed 200) |
| 53 | Focus | H.E.R. | `Uj9y5xkHZaU` | verified (oEmbed 200) | `Z5ze4CUAkE8` | verified (oEmbed 200) |
| 54 | None of Your Concern | Jhené Aiko | `PmeRjrz8KVw` | verified (oEmbed 200) | `MY7i-nk89cs` | verified (oEmbed 200) |
| 55 | Come Down | Anderson .Paak | `-OqrcUvrbRY` | verified (oEmbed 200) | `rptBpOCCMWc` | verified (oEmbed 200) |
| 56 | Slow Down | Smino | `f36Ldh__CNw` | verified (oEmbed 200) | `—` | none found |
| 57 | Good Days | SZA | `2p3zZoraK9g` | verified (oEmbed 200) | `0BdlKkvjEgA` | verified (oEmbed 200) |
| 58 | Heartbreak Anniversary | Giveon | `uWRlisQu4fo` | verified (oEmbed 200) | `nja_0BaQcNg` | verified (oEmbed 200) |
| 59 | Need to Know | Doja Cat | `dI3xkL7qUAc` | verified (oEmbed 200) | `f9CPymNwkYw` | verified (oEmbed 200) |
| 60 | Leave the Door Open | Silk Sonic | `adLGHcj_fmA` | verified (oEmbed 200) | `wIyNAsmGrl0` | verified (oEmbed 200) |
| 61 | California Love | 2Pac | `N0VdRLdg2ng` | verified (oEmbed 200) | `omfz62qu_Bc` | verified (oEmbed 200) |
| 62 | Juicy | The Notorious B.I.G. | `_JZom_gVfuw` | verified (oEmbed 200) | `7Y8VPQcPHhY` | verified (oEmbed 200) |
| 63 | Mo Money Mo Problems | The Notorious B.I.G. | `gUhRKVIjJtw` | verified (oEmbed 200) | `ss142Aix2Bo` | verified (oEmbed 200) |
| 64 | If I Ruled the World | Nas | `mlp-IIG9ApU` | verified (oEmbed 200) | `-8dyp89uWxA` | verified (oEmbed 200) |
| 65 | Nuthin' but a 'G' Thang | Dr. Dre ft. Snoop Dogg | `8GliyDgAGQI` | verified (oEmbed 200) | `O-5O0aQ9u9c` | verified (oEmbed 200) |
| 66 | Gin and Juice | Snoop Dogg | `fWCZse1iwE0` | verified (oEmbed 200) | `zowYObdYejQ` | verified (oEmbed 200) |
| 67 | It Was a Good Day | Ice Cube | `h4UqMyldS7Q` | verified (oEmbed 200) | `b_M_Osdyg_A` | verified (oEmbed 200) |
| 68 | Hard Knock Life | Jay-Z | `rN5OVPcyJ4Q` | verified (oEmbed 200) | `ZaSJMCTOb6g` | verified (oEmbed 200) |
| 69 | Ruff Ryders' Anthem | DMX | `ThlhSnRk21E` | verified (oEmbed 200) | `aF29GPU-Ovc` | verified (oEmbed 200) |
| 70 | C.R.E.A.M. | Wu-Tang Clan | `PBwAxmrE194` | verified (oEmbed 200) | `4yNQ7_7I5aE` | verified (oEmbed 200) |
| 71 | Scenario | A Tribe Called Quest | `Q6TLWqn82J4` | verified (oEmbed 200) | `DiR5IFQmaPc` | verified (oEmbed 200) |
| 72 | Ms. Jackson | Outkast | `MYxAiK6VnXw` | verified (oEmbed 200) | `EUVo8epKwv0` | verified (oEmbed 200) |
| 73 | Doo Wop (That Thing) | Lauryn Hill | `T6QKqFPRZSA` | verified (oEmbed 200) | `YjuhWhqY-bE` | verified (oEmbed 200) |
| 74 | The Rain (Supa Dupa Fly) | Missy Elliott | `hHcyJPTTn9w` | verified (oEmbed 200) | `dLKDHBHckMg` | verified (oEmbed 200) |
| 75 | Shoop | Salt-N-Pepa | `4vaN01VLYSQ` | verified (oEmbed 200) | `Z8WZVHo2T8E` | verified (oEmbed 200) |
| 76 | Mama Said Knock You Out | LL Cool J | `vimZj8HW0Kg` | verified (oEmbed 200) | `nXca2sWFhRk` | verified (oEmbed 200) |
| 77 | Walk This Way | Run-DMC ft. Aerosmith | `4B_UYYPb-Gk` | verified (oEmbed 200) | `5iRdVmEyhJI` | verified (oEmbed 200) |
| 78 | Fight for Your Right | Beastie Boys | `eBShN8qT4lk` | verified (oEmbed 200) | `ClLCqZin9HY` | verified (oEmbed 200) |
| 79 | U Can't Touch This | MC Hammer | `otCpCn0l4Wo` | verified (oEmbed 200) | `SS4ixxxinDc` | verified (oEmbed 200) |
| 80 | Ice Ice Baby | Vanilla Ice | `rog8ou-ZepE` | verified (oEmbed 200) | `kPU9zuStFII` | verified (oEmbed 200) |
| 81 | Baby Got Back | Sir Mix-a-Lot | `X53ZSxkQ3Ho` | verified (oEmbed 200) | `aEqH2p6sEpg` | verified (oEmbed 200) |
| 82 | Jump Around | House of Pain | `jrL_LzX5wv4` | verified (oEmbed 200) | `XhzpxjuwZy0` | verified (oEmbed 200) |
| 83 | Insane in the Brain | Cypress Hill | `RijB8wnJCN0` | verified (oEmbed 200) | `eHR8hEIiSN4` | verified (oEmbed 200) |
| 84 | Tha Crossroads | Bone Thugs-n-Harmony | `VMYAEHE2GrM` | verified (oEmbed 200) | `T-_bM26SvSU` | verified (oEmbed 200) |
| 85 | Regulate | Warren G ft. Nate Dogg | `1plPyJdXKIY` | verified (oEmbed 200) | `eiWClZrJSZY` | verified (oEmbed 200) |
| 86 | Gangsta's Paradise | Coolio | `fPO76Jlnz6c` | verified (oEmbed 200) | `7DXlY8LhWnI` | verified (oEmbed 200) |
| 87 | Around the Way Girl | LL Cool J | `Sm36viw6q1U` | verified (oEmbed 200) | `Fwgt9Dxyyv0` | verified (oEmbed 200) |
| 88 | U.N.I.T.Y. | Queen Latifah | `f8cHxydDb7o` | verified (oEmbed 200) | `9BbUqzcNcl4` | verified (oEmbed 200) |
| 89 | Hip Hop Hooray | Naughty by Nature | `Rz1Xn1vzOM4` | verified (oEmbed 200) | `QcVrDjZch1g` | verified (oEmbed 200) |
| 90 | No Diggity | Blackstreet ft. Dr. Dre | `3KL9mRus19o` | verified (oEmbed 200) | `8cztOO0JVvA` | verified (oEmbed 200) |
| 91 | Killing Me Softly | Fugees | `oKOtzIo-uYw` | verified (oEmbed 200) | `IXl0nMLIUsU` | verified (oEmbed 200) |
| 92 | This Is How We Do It | Montell Jordan | `0hiUuL5uTKc` | verified (oEmbed 200) | `PQoy5OsfNT4` | verified (oEmbed 200) |
| 93 | Return of the Mack | Mark Morrison | `uB1D9wWxd2w` | verified (oEmbed 200) | `K6nw3iKaxfA` | verified (oEmbed 200) |
| 94 | Here Comes the Hotstepper | Ini Kamoze | `15UffN8eilI` | verified (oEmbed 200) | `HiNke_YplfY` | verified (oEmbed 200) |
| 95 | Get Low | Lil Jon & The East Side Boyz | `IYH7_GzP4Tg` | verified (oEmbed 200) | `ZN43UoyAbwg` | verified (oEmbed 200) |
| 96 | Wait (The Whisper Song) | Ying Yang Twins | `HAnXIIv5He8` | verified (oEmbed 200) | `9O2RRWOzTak` | verified (oEmbed 200) |
| 97 | Salt Shaker | Ying Yang Twins | `aJEzl31zL-I` | verified (oEmbed 200) | `mTaRSmDIrIQ` | verified (oEmbed 200) |
| 98 | Stand Up | Ludacris | `pZG7IK99OvI` | verified (oEmbed 200) | `KIZ3fvuo840` | verified (oEmbed 200) |
| 99 | Move B***h | Ludacris | `tw429JGL5zo` | verified (oEmbed 200) | `JcJPx-6pzPY` | verified (oEmbed 200) |
| 100 | Stay Fly | Three 6 Mafia | `vBjzAdpZzf0` | verified (oEmbed 200) | `U_jq38d3FFI` | verified (oEmbed 200) |
| 101 | Knuck If You Buck | Crime Mob | `9saEpqhBP5M` | verified (oEmbed 200) | `j1LHLuQ9P6k` | verified (oEmbed 200) |
| 102 | Lean wit It, Rock wit It | Dem Franchize Boyz | `1OgHtf7DQNA` | verified (oEmbed 200) | `6Vctz1FSvDA` | verified (oEmbed 200) |
| 103 | Laffy Taffy | D4L | `4eVxoIL_Nq0` | verified (oEmbed 200) | `fN7mjtxAQjA` | verified (oEmbed 200) |
| 104 | Tipsy | J-Kwon | `VwXeN2FsE7w` | verified (oEmbed 200) | `Y3H_S65N1b4` | verified (oEmbed 200) |
| 105 | Freek-a-Leek | Petey Pablo | `M48nlk-1kH8` | verified (oEmbed 200) | `-rKEN1wuSVs` | verified (oEmbed 200) |
| 106 | Vice Versa | Pastor Troy | `4hmn4cNXBdY` | verified (oEmbed 200) | `NS6dkt9CVnI` | verified (oEmbed 200) |
| 107 | Snap Yo Fingers | Lil Jon | `AoA-ByjIf2M` | verified (oEmbed 200) | `_Q-oS_SFyQo` | verified (oEmbed 200) |
| 108 | Soul Survivor | Young Jeezy | `gczBgNB-p1w` | verified (oEmbed 200) | `uwN4mVxOAHA` | verified (oEmbed 200) |
| 109 | What You Know | T.I. | `_Ym7Mg4yTZc` | verified (oEmbed 200) | `BjrF1-Qjt14` | verified (oEmbed 200) |
| 110 | ATLiens | Outkast | `ktc9hsSfUck` | verified (oEmbed 200) | `ES8CeZnEaF0` | verified (oEmbed 200) |

Primary video titles returned by oEmbed during verification are recorded in the
build notes; every one matched its pool artist/title (11 automated flags were all
false alarms from featured-artist formatting, plus the 1 real wrong song above).

## Win patterns (added same pass — Korey: "all the different ways you could win")

Pattern library lives in `js/core.js` (`Core.PATTERNS`), data-driven, FREE SPACE
counts as marked for every pattern. Points when the host picks a shape =
squares × 10.

| Pattern | Squares | Points | Shape |
|---------|---------|--------|-------|
| Line | 5 | 50 | any row, column, or diagonal (12 variants) |
| Two Lines | 10 | 100 | any two lines |
| X | 9 | 90 | both diagonals |
| L | 9 | 90 | full outside column + full top/bottom row at its corner (4 rotations) |
| T | 9 | 90 | full top row + full center column |
| U | 13 | 130 | both outside columns + full bottom row |
| Four Corners | 4 | 40 | the four corner squares |
| Plus / Cross | 9 | 90 | full center row + full center column |
| Frame | 16 | 160 | every edge square |
| Full Card | 25 | 250 | every square (blackout) |

Default ladder unchanged when the host doesn't pick: Round 1 Line (50),
Round 2 Two Lines (100), Round 3 Full Card (150), marks carry over.
Claims are still verified host-side against the ACTIVE pattern
(`verifyClaim` with `patternId`) — called-songs-only anti-cheat unchanged.

### Pattern tests (tests/test-core.js — 38 passed, 0 failed)

- One case per pattern: exact shape = win; same card missing one pattern
  square = no win (X, T, U, Four Corners, Plus, Frame, Full Card).
- Line and Two Lines cases, plus L tested in all 4 rotations (win) and
  one-short / missing-corner variants (no win).
- patternPoints table asserted (Line stays 50).
- patternProgress (closest-variant shading) asserted.
- verifyClaim with patternId: an X claim is accepted when the whole X was
  called, and rejected as no-win under a Frame pattern with identical marks.
- Data integrity: every song has a valid yt; every song except slow-down
  has a valid yt2 different from yt; every deck's songs resolve in the pool.
