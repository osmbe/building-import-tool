# Open Issues — Resolution Plan

All branches merged into `main`. Verified against a seeded PostGIS (difference API, all match modes); still needs a check against production data.

8 open issues. Grouped by area; critical ones first.

| # | Title | Label | Area | Status |
|---|-------|-------|------|--------|
| 53 | GRB building pre-filtering | critical | difference API + export | ✅ allow-list (hoofdgebouw, bijgebouw, verdieping) shared by SQL + export |
| 52 | filter by id broke again | critical | difference API (source mode) | ✅ fixed: `;`-separated refs, ref ignored when oidn set; matching on `Entity/oidn` keys |
| 49 | Exported data missing info | critical | difference API + export | ✅ dates as text (no TZ shift), PICC `date_leve`; addresses for GRB/PICC/Urbis |
| 22 | add some "kunstwerken" KNW | data | export (KNW tag map) | ✅ implemented; type 1 now `man_made=bridge`; scope of types 3/4/6/10/12/13 open |
| 6  | Combine difference + source tag filter | — | match mode | ✅ `both` mode; correct stats; Source/Both disabled for non-GRB |
| 59 | Show extraction date of official data | — | frontend layer UI | ✅ `<schema>.import_meta` + `/api/meta/data-dates` + source-button tooltips |
| 9  | Use Overpass to source OSM buildings | — | infra/backend | ✅ implemented (opt-in, all sources, map layer + difference) |
| 8  | Change reference of buildings.osm.be | — | infra/docs | 📝 docs in INSTALL.md; DNS/proxy/OAuth out of repo |

### GRB import: GBA polygons sharing a GBG OIDN (fixed)

GBG and GBA polygons share `grb.building_polygons`. Its `oidn` column used to be `UNIQUE` and the GBA import used
`ON CONFLICT (oidn) DO NOTHING`, so a GBA polygon whose OIDN equalled a GBG OIDN was silently dropped. Fixed by
`processing/sql/migrations/001-grb-polygon-entity.sql`:

- `entity` column (`Gbg`/`Gba`, backfilled from the type label) and `UNIQUE (entity, oidn)`. The GBG and GBA imports
  set the entity explicitly. `gebouw_id` (RltGbgGebouw) is only applied to GBG polygons.
- `grb.buildings_with_addresses` gains `entity` and a unique `polygon_id`, which is now the Martin feature id (an OIDN
  is no longer unique, and the map merges tile fragments by feature id).
- The difference API uses the stored entity and joins addresses on `polygon_id`. Databases that are not migrated yet
  keep working (entity derived from the type label).
- The migration runs as an init script on fresh volumes, from `just db-migrate` (called by `grb-import`,
  `grb-update` and the view refresh) and from `webhook/restore-grb.sh` before the data-only dump is restored.
  The restore now also refreshes the view, which the data-only dump does not carry.

---

## #49 — Exported data is missing information (critical)

Two sub-problems:

1. **`source:geometry:date` missing in geometry comparison + should be date-only (not datetime).**
   - `app/composables/useJosmExport.ts` L97-109: when the value already contains `-`, it copies the
     whole string including any `T..:..:..` time part. Fix: strip to the first 10 chars / split on `T`
     and space so output is always `YYYY-MM-DD`.
   - `difference.post.ts` already selects `survey_date`/`opndatum` for GRB geometry mode (L185, L208), so
     the date *is* provided — confirm it survives to the feature properties (it maps to `opndatum`). Verify
     KNW path (`survey_date`) and PICC/Urbis (no date column → acceptable, none exists).

2. **PICC and GRB exports don't contain addresses.**
   - `difference.post.ts`: GRB geometry/source queries select from `grb.building_polygons` (no address
     columns). Join to address data so the candidate features carry `addr:*`. Source of truth:
     `grb.buildings_with_addresses` matview (addresses aggregated per building via `gebouw_id`).
   - PICC/Urbis already query `*.buildings_with_addresses` matviews but only `SELECT building_id/objectid` —
     add their address columns.
   - `useJosmExport.ts`: emit `addr:street` / `addr:housenumber` / `addr:postcode` from the address
     properties. **Caveat:** OSM convention is one address per node/way. A building with multiple GRB
     addresses cannot be cleanly tagged with a single `addr:*` set → for multi-address buildings, do **not**
     auto-emit a single addr (leave for JOSM) but still surface the list. Single-address → emit `addr:*`.

## #53 — GRB building pre-filtering (critical)

Rules from issue:
- GBG: only gbg-1/gbg-2 are buildings; **gbg-3** (`gebouw afgezoomd met virtuele gevels`) must NOT be tagged building.
- GBA: `verdieping` (gba1) → `building=yes` **plus** `fixme="verdieping, correct the building tag, add
  building:level and building:min_level before upload in JOSM!"`. All other GBA types → no building tag.

GBG and GBA share `grb.building_polygons`, distinguished by `type_label` (LBLTYPE).
- Building labels: `hoofdgebouw`, `bijgebouw`, `afdak`, `ingezonken/verheven garagetoegang`.
- Excluded: `trap`, `gebouw afgezoomd met virtuele gevels`, and (special) `verdieping`.

Implementation:
- `difference.post.ts` GRB queries (source + geometry, both branches): add a `type_label` filter that
  excludes non-building labels **except** `verdieping`, which is kept and flagged. Surface `lbltype` so the
  exporter can act on it (already selected).
- `useJosmExport.ts`: when `type_label === 'verdieping'`, set the `fixme` tag (keep `building=yes`).
  When label is an excluded non-building type, drop `building`.

## #52 — filter by id broke again (critical)

"Source tag" mode removes no candidates even when many should match.
- Logic in `difference.post.ts` source branch looks correct (`bp.oidn::text != ALL($oidnList)`), so the
  likely cause is the OSM-side lookup returning an empty oidn list (tags not matched / projection).
- Actions: (a) harden the OSM oidn extraction — trim whitespace, also accept ref entity-agnostic; (b) add
  diagnostics (counts) to the response stats so the failure is visible; (c) **needs live DB to reproduce** —
  flag for verification against the test server.

## #22 — add some "kunstwerken" KNW (data)

Largely already implemented in `useJosmExport.ts` `KNW_TAG_MAP_BY_CODE` (types 1,5,7,8,9,11,14,22,23,24)
and documented in `GRB_PROPERTY_MAPPINGS.md`. Remaining: confirm the relevant-type list matches the issue,
ensure out-of-scope KNW types export without a bogus `building=yes` (already deleted for KNW). Close-out /
verification task rather than new code.

## #6 — Combine filtering by difference and source tags

Add a third match mode `both` (geometry AND missing source tag) so a candidate must be both spatially
unmatched and lack a `source:geometry:oidn`. Touch `useMatchMode.ts`, `MatchModeControl.vue`, and the
`difference.post.ts` GRB branch (intersect the two candidate sets).

## #59 — Show the extraction date of the official data

Show GRB/PICC/URBIS data extraction date on layer-name hover. Needs a source for the date:
- GRB: max(`survey_date`) or an import-timestamp; expose via a small API (`/api/meta/data-dates`).
- Render as `title`/tooltip on the layer label in the layers UI.

## #9 — Use Overpass to source OSM buildings

Larger change: add an option to fetch OSM buildings live from Overpass for the current bbox instead of the
daily Postgres mirror, to refresh filters quickly. Needs design (rate limits, projection, caching). Propose
as opt-in toggle; **requires decision** before implementing.

## #8 — Change reference of buildings.osm.be to new tool

Infra/docs: point `buildings.osm.be` → new tool, keep old reachable at `old-buildings-tool.osm.be`. Requires
DNS / proxy (NPM) changes on the server — **out of repo scope**, documented for the maintainer.

---

## Execution order
1. #49 (export correctness) + #53 (pre-filtering) — same files, highest user impact.
2. #22 verification.
3. #6 combined mode.
4. #59 extraction date.
5. #52 hardening + flag for live verification.
6. #8 / #9 — document, require maintainer decisions.
