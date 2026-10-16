# Property mappings for the JOSM export

How the candidates of every source (GRB, KNW, PICC, Urbis) become OpenStreetMap tags when they are exported to
JOSM.

## 1. How the export works

Every source exposes its buildings through the same **candidates contract** (database views
`grb.candidates`, `grb.knw_candidates`, `picc.candidates`, `urbis.candidates`; see CLAUDE.md). The difference API
returns candidates with these properties, and `candidateTags` in `app/utils/candidates.ts` builds the OSM tags from
them, per `source`. Only the tags below are written: no source property is ever copied into OSM.

| Contract property | Source column | OSM tag |
|---|---|---|
| `source`, `type_label` | GRB LBLTYPE, KNW type, PICC nature | `building=yes` (section 2), KNW defaults (section 3) |
| `survey_date` | GRB OPNDATUM, KNW OPNDATUM, PICC DATE_LEVE | `source:geometry:date` (YYYY-MM-DD) |
| `source_ref` | GRB entity + OIDN | `source:geometry:ref` (`Gbg/718523`, `Gba/2664`, `Knw/7001`) |
| `addresses`, `street_names`, `postcodes`, `municipalities`, `address_count` | addresses inside the polygon | `addr:*` (section 4) |

Tags are written in this order: `building`, `fixme`, the KNW defaults, `source:geometry:date`,
`source:geometry:ref`, `addr:street`, `addr:housenumber`, `addr:postcode`, `addr:city`. The API integration
tests compare the export of every source with a recorded snapshot (`app/tests/integration/__snapshots__/export-*.osm`).

### source:geometry:ref

GBG and GBA OIDNs are only unique per entity, so the reference always carries the entity:
`<entity>/<oidn>`. The entity is stored per polygon (`grb.building_polygons.entity`, set by the GBG/GBA import).
Source-tag matching (issue #52) compares these `Entity/oidn` keys, not bare numbers. PICC and Urbis have no
reference in OSM, so they get no `source:geometry:ref`.

## 2. Buildings

GRB polygons are filtered on their LBLTYPE (issue #53, allow-list `BUILDING_TYPE_LABELS` in
`app/utils/grbExportTags.ts`). The difference API leaves the other types out of the candidates, and the export
never tags them as buildings:

| GRB LBLTYPE | Entity | OSM tags |
|-------------|--------|----------|
| `hoofdgebouw` | GBG (gbg-1) | `building=yes` |
| `bijgebouw` | GBG (gbg-2) | `building=yes` |
| `verdieping` | GBA (gba-1) | `building=yes` + `fixme=verdieping, correct the building tag, add building:level and building:min_level before upload in JOSM!` |
| `gebouw afgezoomd met virtuele gevels` | GBG (gbg-3) | not exported |
| every other GBA type (`trap`, `afdak`, `luifel`, `loopbrug`, garage entrances, ...) | GBA | not exported |
| no label | GBG | `building=yes` |

PICC and Urbis buildings always get `building=yes`: the allow-list is GRB only (a PICC nature such as `Batiment`
is not a GRB type). Refine the generic `building=yes` in JOSM where the actual use is known.

## 3. KNW (kunstwerken)

KNW structures get no building tag. Their reference is `Knw/<oidn>`. Supported defaults (issue #22):

| KNW Type (`type_code`) | KNW Type (`type_label`) | Default OSM tags |
|------------------------|-------------------------|------------------|
| `1` | `overbrugging` | `man_made=bridge` (bridge outline area) |
| `5` | `pijler` | `man_made=bridge_support` |
| `7` | `schoorsteen` | `man_made=chimney` |
| `8` | `koeltoren` | `man_made=cooling_tower` |
| `9` | `silo, opslagtank` | `man_made=silo` (or `man_made=storage_tank` when the label says opslagtank and not silo) |
| `11` | `watertoren` | `man_made=water_tower` |
| `14` | `nutspaal type windturbine` | `power=generator`, `generator:source=wind`, `generator:method=wind_turbine` |
| `22` | `golfbreker, strandhoofd en lage havendam` | `man_made=breakwater` |
| `23` | `havendam` | `man_made=breakwater` |
| `24` | `staketsel` | `man_made=pier` |

KNW types outside this list are exported without a structure tag and need manual tagging in JOSM.

## 4. Addresses

Addresses are joined to the polygon that contains them (docs/GRB_ADDRESS_JOIN.md). OSM puts one address on one
object, so `addr:*` tags are written only when the candidate has exactly one address (issue #49), never for KNW:

- `addr:street`: the first street name;
- `addr:housenumber`: what follows the street name in the address, when it looks like a house number (`12`,
  `12A`, `12/3`; a letter suffix is one letter, not the next word);
- `addr:postcode`, `addr:city`: the first postcode and municipality.

Candidates with several addresses are left for manual handling in JOSM.

## 5. Export workflow

1. **Candidates**: the features of the candidate layer (difference API results).
2. **Tags**: `candidateToOsmFeature` replaces their properties with the tags above.
3. **Geometry simplification**: optional (mapshaper, 85% by default).
4. **OSM XML**: `app/utils/geojsonToOsm.ts`.
5. **JOSM**: through the remote control API (`composables/useJosmExport.ts`).
