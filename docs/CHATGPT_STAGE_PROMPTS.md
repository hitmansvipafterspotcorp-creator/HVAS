# HVAS — ChatGPT Image Prompts for Side-Scroller Stages

Copy-paste prompts for building side-scroller venue stages in ChatGPT (GPT-4o
image gen). Read the rules once, then work down the list.

## Rules that make the assets drop straight into the game
- **Generate everything in ONE ChatGPT chat.** After the first image, start
  later prompts with *"Same exact art style, lighting, and proportions as the
  previous image."* — that's what keeps 10 venues looking like one game.
- **Size:** ChatGPT maxes at **1536×1024 (landscape)**. Ask for that on every
  backdrop. For a longer block, generate it as **2 segments** ("left half" +
  "right half with the entrance") and I stitch + scroll them.
- **Transparent cutouts:** for props, doors, and enemies say *"transparent
  background, isolated object, PNG."* For full-scene backdrops you do NOT need
  transparency.
- **Naming when you save:** `venue_bg.png`, `venue_bg_right.png`,
  `venue_door.png`, `venue_props.png`, `enemy_<name>.png`. Drop them in
  `assets/venues/` (backdrops/props/doors) and `assets/characters/` (enemies).

---

## STYLE BLOCK — paste at the top of every backdrop/prop/door prompt
> Style: richly detailed digital illustration in the look of a modern 2.5D
> beat-'em-up / side-scroller video game background. Nighttime Tallahassee
> nightlife. Moody cinematic lighting, vivid neon signage in magenta, purple,
> electric blue and warm gold, wet reflective pavement, light atmospheric haze.
> High detail, painterly but clean, game-ready. NOT pixel art. Dark neon
> "HITMANS VIP" club aesthetic.

## TECH BLOCK — paste after the style block on every BACKDROP prompt
> Flat side-on elevation view — straight-on, eye level, NO isometric tilt and
> NO vanishing-point perspective — so it works as a horizontally scrolling
> side-scroller stage running left to right along a city block. Keep the bottom
> ~22% as flat, empty sidewalk/street ground (the walkable lane) with nothing
> important placed there. 16:9 landscape, 1536×1024.

---

## 1. BACKDROP — the wide facade (the important one)

### Template (swap the CAPS parts)
> A wide nighttime street-block facade for **VENUE_NAME**, a **ONE-LINE
> DESCRIPTION**. Show the building exterior, its lit signage/marquee, the
> entrance area, windows, and street-level detail across the whole width.
> [STYLE BLOCK] [TECH BLOCK]

### Filled per venue
**Cafe8Fifty** (have it — use as the style anchor)
> A wide nighttime street-block facade for Cafe8Fifty, an upscale neon coffee-
> and-cocktail spot with a glowing "850" sign and a red carpet at a roped VIP
> entrance. [STYLE + TECH]

**Kingdom Come Saloon (KCS)**
> A wide nighttime street-block facade for the Kingdom Come Saloon, a modern
> neon-lit Western-style saloon bar with swinging-door entrance, wood-and-brass
> facade, a glowing crown/"KCS" marquee, and a patio with string lights. [STYLE + TECH]

**Social Gaines**
> A wide nighttime street-block facade for Social Gaines, a stylish upscale
> social lounge with floor-to-ceiling tinted windows, a lit "SOCIAL GAINES"
> sign, velvet ropes, and a doorman podium. [STYLE + TECH]

**Dukes**
> A wide nighttime street-block facade for Dukes, a lively neighborhood
> bar-and-grill with a big lit "DUKES" sign, brick facade, neon beer signs in
> the windows, and an outdoor patio. [STYLE + TECH]

**Outta Pocket**
> A wide nighttime street-block facade for Outta Pocket, a dim neon pool hall /
> dive bar with a glowing 8-ball sign, tinted windows showing pool-table lights
> inside, and a graffiti-tagged side wall. [STYLE + TECH]

**Quick Hit Fuel (QHF)**
> A wide nighttime facade for Quick Hit Fuel, a neon-drenched 24-hour
> gas-station convenience store with lit fuel canopy, glowing storefront
> windows full of product, ice freezer, and a bright "QHF" sign. [STYLE + TECH]

**13Rave** (Tally Row indoor — interior stage)
> A wide interior stage for 13Rave, an underground rave club: dark warehouse
> room with a laser-lit DJ booth, hanging LED panels, fog, a crowd silhouette
> at the back, and a neon "13" motif. Flat side-on elevation, bottom ~22% clear
> dance-floor lane. [STYLE + TECH]

**Success Rooftop** (bonus)
> A wide rooftop-lounge stage at night: glass railing overlooking a glowing
> Tallahassee skyline, low neon furniture, a lit bar on one side, string lights
> overhead. [STYLE + TECH]

**HITMANS VIP After Spot** (the final destination)
> A wide nighttime facade for the HITMANS VIP After Spot, an exclusive
> members-only after-hours club — blacked-out luxury facade, a single guarded
> golden doorway under a glowing purple "HITMANS VIP AFTER SPOT — MEMBERS ONLY"
> sign, velvet rope, and a bouncer podium. Feels like the end-of-night goal.
> [STYLE + TECH]

> **Longer block tip:** add to any of the above: *"This is the LEFT half of the
> block; leave the right edge open to continue."* Then generate a matching
> *"RIGHT half of the same block, ending at the lit entrance door, same art
> style as previous."*

---

## 2. DOOR — the entrance you walk to (transparent cutout)
> A single lit nightclub/venue entrance door for **VENUE_NAME**, isolated and
> centered with empty padding around it on a plain flat background for easy
> cutout. Front-on, ornate glowing doorway with a small sign above it, closed.
> Transparent background PNG. [STYLE BLOCK — skip the TECH block]. 1024×1024.

*(Skip this if the facade prompt already includes a clear entrance — I can use that.)*

---

## 3. PROPS — foreground street objects (one transparent sheet)
> A neat grid of isolated nighttime street props for a neon club block:
> streetlight/lamp post, fire hydrant, planter with a small tree, metal trash
> can, velvet-rope stanchion, A-frame sidewalk sign, wooden bench, and a vendor
> tent. Each object fully separated with clear empty space around it, even
> spacing, consistent scale and lighting, front/side view. Plain flat neutral
> background, transparent PNG for easy cutout. [STYLE BLOCK]. 1536×1024.

---

## 4. ENEMIES — side-view brawler opponents (match the fighters)

### 4a. Character design (do this first, per enemy)
> A chibi-proportioned street-tough character for a beat-'em-up game enemy
> named **ENEMY_NAME**, **DESCRIPTION** (e.g. "a heavyset bouncer in a black
> tee", "a wiry hype-man in a tracksuit"). Big stylized head, detailed
> streetwear with subtle neon accents, matching the HITMANS VIP chibi fighter
> roster. Full body, 3/4 side view, standing. Plain flat background, transparent
> PNG. 1024×1024.

### 4b. Turn it into an animation strip (repeat per action)
> Same character, same style. An 8-frame **walk cycle** shown left to right as
> 8 evenly-spaced full-body poses in one horizontal row, side profile facing
> right, consistent size and baseline, plain flat background, transparent PNG.
> 1536×1024.

Repeat 4b swapping **walk cycle** for: **idle breathing**, **punch/attack**,
**getting hit (recoil)**, **knocked down**. Same wording keeps them on-model.

### Named bosses to make this way (end-of-block fights)
- **ELD** (Entry Line Disruptor) — works the line, agitator
- **Big Soulja** — heavyset power bruiser
- **Predator Pete** — lurking rooftop/parking-lot rival
- **Agent Snow** — cold, sharp-dressed late-night final boss
- Plus 2–3 generic **"goon"** looks for the waves.

---

## Priority order (don't do all at once)
1. **One facade** (start with KCS or Social Gaines — you already have partials).
2. **One enemy** (a generic goon: design → walk → attack → hit → down).
3. The **door** + **props sheet** for that same venue.
That's a full playable stage. Then repeat per venue.
