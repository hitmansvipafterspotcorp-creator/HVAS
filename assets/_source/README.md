# Source sheet archive

Original art sheets that are **not used at runtime** — finished-design renders,
route-test / gameplay-fit sheets, layout maps, and spare component pages.

Kept here (not deleted) as the re-slice / reference source. They are NOT cached
by the service worker and NOT fetched by the app, so they don't bloat the
deployed PWA. The backdrops and prop cutouts already generated from these live
under `assets/venues/` and `assets/venues/props/`.

If you need to re-cut a venue, the active prop-source pack sheets still live in
`assets/venues/` (referenced by tools/slice_venue_props.py and
tools/cut_props_labeled.py).
