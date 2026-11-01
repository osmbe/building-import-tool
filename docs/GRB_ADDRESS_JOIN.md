# GRB Address-Building Join: GEBOUWID Mismatch

## Problem

The GRB data model uses `GEBOUWID` in two different relationship files, but they reference **different ID namespaces**:

| Source File | Product | Column | Distinct IDs | ID Range |
|---|---|---|---|---|
| `RltGbgGebouw*.dbf` | GBG (6553) | GEBOUWID | 660,375 | 5.6M - 32M |
| `RltAdresGebouw*.dbf` | GRB-Adres (10445) | GEBOUWID | 873,207 | 10M - 20.5M |
| **Overlap** | | | **43,301** (5%) | |

- `RltGbgGebouw` maps GBG polygon OIDN to a building grouping ID (used to populate `building_polygons.gebouw_id`)
- `RltAdresGebouw` maps ADRESID to a building ID in the Gebouwenregister (building registry)

Despite using the same column name `GEBOUWID`, only **5% of address link IDs** match the GBG building IDs. This means the ID-based join through `address_building_links` only resolves addresses for ~25,000 out of 5M+ building polygons.

## Evidence (March 2026 data)

```
building_polygons total:           5,052,689
  - with gebouw_id populated:        375,295   (from RltGbgGebouw)
  - with gebouw_id NULL:           4,677,394   (GBA polygons + unmatched)

address_building_links:            3,922,134   (from RltAdresGebouw)
  - distinct building_object_id:     873,207

Overlap (gebouw_id matches):        25,586 polygons with addresses (0.5%)
```

## Solution: Spatial Join

Instead of joining through `address_building_links.building_object_id = building_polygons.gebouw_id`, the `buildings_with_addresses` materialized view now uses **ST_Contains** to spatially match each address point to the building polygon that physically contains it.

```sql
-- Old approach (broken): ID-based join via address_building_links
FROM grb.address_building_links abl
JOIN grb.addresses a ON abl.adres_id = a.adres_id
GROUP BY abl.building_object_id::BIGINT  -- wrong ID namespace

-- New approach (correct): spatial containment
FROM grb.building_polygons bp
JOIN grb.addresses a ON ST_Contains(bp.geom, a.geom)
GROUP BY bp.id
```

This works because:
- Address points in the GRB dataset are geocoded to building locations
- GIST spatial indexes on both `building_polygons.geom` and `addresses.geom` make the join efficient
- No dependency on matching ID namespaces

## Impact on Import Workflow

The address-building links (`RltAdresGebouw*.dbf`, part of the addresses download) are not imported: the materialized view resolves addresses by geometry only. Migration `grb/007_drop_unused` dropped the `grb.address_building_links` table; the analysis above dates from when it was still imported.

## Main addresses, subaddresses and `building:flats`

The view (`grb/008_address_summary.sql`, the current definition) distinguishes two kinds of address rows:

- a **main address** has an empty `box_number`;
- a **subaddress** (“bus”) has a non-empty `box_number`.

Both stay in `grb.addresses`. Per candidate polygon, the view builds the address value from the main addresses only
and summarizes their house numbers (`1,1A,3,5` → `1,1A,3-5`). If the main addresses span more than one street, the
address columns are left empty. Subaddresses are matched to a main address by the same
`(street_name, house_number)` pair and contribute to `flats` instead:

```text
flats = count(distinct subaddresses)
      + count(distinct main addresses without a matching subaddress)
```

The result is exposed as `details.flats` (only when greater than `1`) and exported as `building:flats` for GRB
polygons tagged `building=yes`. The address point is still assigned to a polygon by
`ST_Contains(bp.geom, a.geom)`; `RltAdresGebouw` remains unused.
