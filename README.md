# BE2OSM

A web application for importing Belgian building data (GRB/PICC/URBIS) to OpenStreetMap.

## What it does

- Displays official buildings data from region source alongside existing OSM buildings
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

- **GRB**: Building polygons from official data
- **OSM**: OpenStreetMap buildings via Geofabrik extracts

## Documentation

- [INSTALL.md](INSTALL.md) - Server deployment guide
