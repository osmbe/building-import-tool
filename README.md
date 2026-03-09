# BE2OSM

A web application for importing Belgian building data to OpenStreetMap, covering all three regions: Flanders (GRB), Wallonia (PICC), and Brussels (URBIS).

## What it does

- Displays official regional building data alongside existing OSM buildings on an interactive map
- Compares geometries to identify missing or outdated buildings
- Exports selected buildings to JOSM for editing
- Authenticates via OSM OAuth 2.0

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Nuxt App   │────▶│   Martin    │────▶│  PostgreSQL │
│  (Frontend) │     │ (Tiles API) │     │  (PostGIS)  │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────┐           │
                    │ Processing  │───────────┘
                    │ (Just/ogr2ogr/imposm3)
                    └─────────────┘
```

## Data Sources

### GRB — Flanders

The [Grootschalig Referentie Bestand](https://www.vlaanderen.be/digitaal-vlaanderen/onze-oplossingen/basiskaart-vlaanderen-grb) (GRB) is Flanders' large-scale reference map maintained by Digitaal Vlaanderen. It contains ~5M building polygons with survey dates, building part classifications, and address links.

- **Provider**: [Digitaal Vlaanderen](https://www.vlaanderen.be/digitaal-vlaanderen) (download API at `download.api.vlaanderen.be`)
- **Format**: Shapefile (Lambert 72 / EPSG:31370)
- **Import tool**: ogr2ogr
- **Differential updates**: Supported via the API's `temporalCrop` parameter

### PICC — Wallonia

The [Projet Informatique de Cartographie Continue](https://geoportail.wallonie.be/catalogue/b795de68-726c-4bdf-a62a-a42686aa5b6f) (PICC) is Wallonia's continuous cartographic reference dataset. It contains ~3.9M building footprints and ~2M address points.

- **Provider**: [Service Public de Wallonie](https://geoportail.wallonie.be/) (via MetaWal GeoNetwork)
- **Format**: FileGDB for buildings, Shapefile for addresses (Lambert 72 / EPSG:31370)
- **Import tool**: ogr2ogr
- **Differential updates**: Supported via ArcGIS REST MapServer queries filtered by `DATE_MODIF`

### OSM — OpenStreetMap

Existing building data from OpenStreetMap, used as the reference to compare against official datasets.

- **Provider**: [Geofabrik](https://download.geofabrik.de/europe/belgium.html) (Belgium extract)
- **Format**: PBF
- **Import tool**: imposm3
- **Differential updates**: Supported via Geofabrik daily replication diffs

### URBIS — Brussels (planned)

[UrbIS](https://datastore.brussels/web/urbis) is the Brussels-Capital Region's reference map. Support is planned but not yet implemented.

## Documentation

- [INSTALL.md](INSTALL.md) - Server deployment guide
