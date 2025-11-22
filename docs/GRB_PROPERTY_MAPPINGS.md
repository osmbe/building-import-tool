# GRB Building Property Mappings for JOSM Export

This document details how GRB (Grootschalig Referentie Bestand) building properties are mapped to OpenStreetMap tags before exporting to JOSM.

## Overview

The GRB building data undergoes property transformation before being exported to JOSM. This includes:
- Mapping GRB-specific properties to OSM standard tags
- Removing internal metadata tags
- Formatting dates to OSM standards
- Creating composite reference tags
- Mapping building types

## 1. Core Property Mappings

### GRB Properties → OSM Tags

| GRB Property | OSM Tag | Value/Logic |
|--------------|---------|-------------|
| `LBLTYPE` (hoofdgebouw) | `building` | `house` |
| `LBLTYPE` (bijgebouw) | `building` | `shed` |
| `LBLTYPE` (afdak) | `building` | `roof` |
| `LBLTYPE` (ingezonken garagetoegang) | `building` | `garage1` |
| `LBLTYPE` (verheven garagetoegang) | `building` | `garage2` |
| `OIDN` | `source:geometry:oidn` | Unique GRB object identifier |
| `OPNDATUM` | `source:geometry:date` | Date (formatted to YYYY-MM-DD) |

### Properties Removed During Export

The following GRB properties are **deleted** before export:

| Property | Description |
|----------|-------------|
| `LENGTE` | Geometry length |
| `OPPERVL` | Surface area |
| `TYPE` | Type code |
| `UIDN` | Unique identifier |

## 2. Address Properties

Address information is sourced from DBF database files and mapped as follows:

| DBF Field | OSM Tag | Source Files |
|-----------|---------|--------------|
| `huisnr` | `addr:housenumber` | TblGbgAdr/TblGbaAdr/TblKnwAdr |
| `busnr` | `addr:flats` | TblGbgAdr (apartment ranges) |
| `straatnm` | `addr:street` | TblGbgAdr |
| `appartnr` | (specialized address) | TblGbgAdr |

## 3. Synthetic Properties

### source:geometry:ref

This composite property is **created** during export:

```
source:geometry:ref = source:geometry:entity + "/" + source:geometry:oidn
```

**Example:** `Gbg/718523`

**Components:**
- `source:geometry:entity`: Entity type
  - `Gbg` = Gebouwen (Buildings)
  - `Knw` = Kunstwerken (Structures)
  - `Gba` = Gebouwaanhorigheid (Building attachments)
  - `Picc` = PICC data (Walloon region)
  - `Urbis` = URBIS data (Brussels region)
- `source:geometry:oidn`: Object ID Number

After creation, the component properties (`source:geometry:entity` and `source:geometry:oidn`) are deleted.

## 4. Metadata Tags Removed Before Export

The following metadata tags are **deleted** before sending to JOSM:

| Tag | Description |
|-----|-------------|
| `size_grb_building` | GRB building size metric |
| `source:geometry:uidn` | Unique identifier |
| `source` | Source information (redundant) |
| `H_DTM_MIN` | Digital Terrain Model minimum height |
| `H_DTM_GEM` | Digital Terrain Model mean height |
| `H_DSM_MAX` | Digital Surface Model maximum height |
| `H_DSM_P99` | Digital Surface Model 99th percentile height |
| `HN_MAX` | Building height maximum |
| `HN_P99` | Building height 99th percentile |
| `detection_method` | Detection algorithm identifier |
| `size_shared` | Shared size metric |
| `size_source_building` | Source building size |
| `auto_building` | Temporary tag (migrated to `building`) |
| `size_source_landuse` | Landuse size metric |
| `source:geometry:entity` | Entity type (after creating ref) |
| `source:geometry:oidn` | Object ID (after creating ref) |
| `auto_target_landuse` | Landuse target tag |

## 5. Building Type Mappings

### GRB LBLTYPE → OSM building Tag

| GRB LBLTYPE | OSM `building=` | Description |
|-------------|-----------------|-------------|
| `hoofdgebouw` | `house` | Main building |
| `bijgebouw` | `shed` | Secondary/auxiliary building |
| `afdak` | `roof` | Roof structure only |
| `ingezonken garagetoegang` | `garage1` | Recessed garage entrance |
| `verheven garagetoegang` | `garage2` | Raised garage entrance |

### LBLTYPE Values Removed

The following LBLTYPE values are **deleted** during processing:

- `trap` (stairs)
- `verdieping` (floor level)
- `gebouw afgezoomd met virtuele gevels` (virtual building outline)

## 6. Property Transformations

### Date Formatting

GRB dates are converted from `DD/MM/YYYY` to `YYYY-MM-DD` format:

```javascript
// Example: "15/03/2023" → "2023-03-15"
source:geometry:date = formatDate(OPNDATUM)
```

### auto_building → building

The intermediate `auto_building` tag is migrated to the standard `building` tag:

```javascript
if (auto_building exists) {
  building = auto_building
  delete auto_building
}
```

## 7. Metadata Tags Preserved

The following metadata is **retained** for traceability in JOSM:

| Tag | Description |
|-----|-------------|
| `source:geometry:ref` | GRB reference (format: "Entity/OIDN") |
| `source:geometry:date` | Date of geometry data |
| `source:geometry:version` | Version (for URBIS data) |
| `addr:street` | Street name |
| `addr:housenumber` | House number |
| `addr:flats` | Flat/apartment numbers |
| `building:levels` | Number of building levels |
| `building:min_level` | Minimum building level |
| `man_made` | For non-building structures |
| `highway` | For road features |

## 8. Data Sources

The property mappings support data from multiple Belgian regional sources:

- **GRB**: Flemish government building registry
  - Gebouwen (Gbg) - Buildings
  - Kunstwerken (Knw) - Structures
  - Gebouwaanhorigheid (Gba) - Building attachments
- **PICC**: Walloon region building data
- **URBIS**: Brussels region building data

## 9. Export Workflow

1. **Feature Extraction**: Features extracted from OpenLayers vector layer
2. **Property Filtering**: Remove metadata, transform properties
3. **Geometry Simplification**: Optional (using mapshaper at 85% default)
4. **JSON to OSM-XML Conversion**: Using geojsontoosm library
5. **Deduplication**: Remove overlapping buildings based on:
   - `source:geometry:ref` comparison
   - Date comparison (keeps newer version)
   - Regional boundary checking
6. **Upload to JOSM**: Via Remote Control API
