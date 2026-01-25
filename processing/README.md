# BE2OSM Data Processing

Data import and processing tools for Belgian geographic datasets (GRB, OSM).

## Architecture

This folder contains **task automation** and **database management** tools - **no custom processing code**. All data transformations are handled by proven, battle-tested tools:

- **OSM Import**: imposm3 (Go-based OSM importer)
- **GRB Import**: ogr2ogr (GDAL command-line tool)
- **Task Automation**: Just task runner with justfiles
- **Database**: PostgreSQL + PostGIS

## Quick Start

### Option 1: Docker (Recommended for Quick Setup)

**Note**: Docker services are defined in the **root** `docker-compose.yml`, not in this folder.

```bash
# From project root
# Build the container (includes all tools)
docker compose build processing

# Run tasks in container
docker compose run --rm --profile processing processing just osm-download
docker compose run --rm --profile processing processing just osm-import

# Or use interactive shell
docker compose run --rm --profile processing processing bash
```

See [DOCKER.md](DOCKER.md) for detailed Docker usage.

### Option 2: Native Installation

```bash
# Install required tools
brew install just imposm ogr2ogr postgresql postgis jq curl unzip

# Set up environment (from project root)
cd ..
cp .env.example .env
nano .env  # Add your DIGITAL_VLAANDEREN_API_KEY and other credentials
cd processing
```

**Note**: All processing tasks use the **root `.env` file** (located at `../.env`). There's no separate `.env` in the `processing/` folder.

### Database Setup

```bash
# Start local PostgreSQL (via Docker)
# Database schemas are created automatically on first start
docker compose up -d
```

### OSM Data Import

```bash
# Download Belgium OSM data from Geofabrik
just download-osm

# Import OSM buildings to database
just import-osm

# Check status
just db-status
```

### GRB Data Import

```bash
# Complete workflow (order → wait → download → import)
just grb-full

# Or step-by-step:
just grb-order-all       # Order all datasets
just grb-status-orders   # Check order status
just grb-download-all    # Download ready orders
just grb-import          # Import to database

# Check status
just grb-status
```

## Folder Structure

```
processing/
├── justfile                   # Unified task runner (OSM + GRB)
├── config/
│   └── imposm-mapping.yml     # imposm3 OSM import mapping
├── sql/
│   └── transforms/            # Data transformation SQL
│       └── transform-imposm-to-schema.sql
├── data/                      # Data directory (git-ignored)
│   ├── grb/                   # GRB shapefiles
│   └── osm/                   # OSM PBF files and cache
└── README.md

# Database schemas are in postgres/ folder (runs on container init)
```

## Available Commands

### OSM Import (just)

```bash
just osm-download            # Download Belgium OSM PBF
just osm-import              # Full import pipeline
just osm-status              # Show OSM statistics
just db-shell-osm            # Open psql shell (osmbe)
just clean-osm-cache         # Clean imposm3 cache
just osm-rebuild             # Clean and re-import
```

### GRB Import (just)

```bash
# Order data from API
just grb-order-all         # Order all GRB datasets
just grb-status-orders     # Check order status

# Download and import
just grb-download-all      # Download ready orders
just grb-import            # Import to PostgreSQL
just grb-full              # Complete workflow (order → wait → download → import)

# Updates
just grb-update            # Differential update (changes since last)

# Utilities
just grb-status            # Database statistics
just db-shell-grb          # Open psql shell (be2osm)
just clean-grb-all         # Clean downloads
```

## Data Pipeline

### OSM Import Pipeline

```
Geofabrik PBF → imposm3 (read) → imposm3 (write to import schema)
              → SQL transform → osm.osm_buildings table
```

**Processing time**: Belgium (~1.5GB) in 7-8 minutes

### GRB Import Pipeline

```
Digital Vlaanderen API → Shapefiles → ogr2ogr (Lambert 72 → WGS84)
                                    → grb.building_polygons
                                    → SQL aggregation
                                    → grb.buildings
```

**Processing time**: ~5M polygons in 5-10 minutes

## Database Schema

### osmbe Database (OSM Data)

- `osm.osm_buildings`: OSM buildings with tags and geometries
- `import.*`: Temporary schema for imposm3 import

### be2osm Database (GRB Data)

- `grb.building_polygons`: Individual GRB building parts (~5M rows)
- `grb.buildings`: Aggregated buildings (grouped by gebouw_id)
- `grb.addresses`: Address points (~1.3M rows)
- `grb.address_building_links`: Address-to-building relationships (~3.9M rows)
- `grb.buildings_with_addresses`: Materialized view (buildings + addresses)

## Configuration

**Important**: All configuration is stored in the **root `.env` file** (one level up from this folder).

The justfile automatically loads environment variables from `../.env`.

### Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=15432
DB_USER=brunomoyse
DB_PASSWORD=<your_password>
DB_NAME=osmbe

# Digital Vlaanderen API
DIGITAL_VLAANDEREN_API_KEY=<your_api_key>
DIGITAL_VLAANDEREN_API_BASE_URL=https://api.vlaanderen.be/gebouwenregister/v2

# OSM Data Source
OSM_REGION=europe/belgium
```

### imposm3 Mapping (config/imposm-mapping.yml)

Defines which OSM tags to import:
- Filters for `building=*` tags
- Preserves all tags in hstore column
- Extracts common tags as dedicated columns

## Troubleshooting

### imposm3 Not Found

```bash
# macOS
brew install imposm

# Linux
# Download from https://github.com/omniscale/imposm3/releases
```

### Database Connection Failed

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -h localhost -p 15432 -U brunomoyse -d osmbe
```

### GRB API Authentication Failed

Make sure `DIGITAL_VLAANDEREN_API_KEY` is set in the root `.env`:
```bash
# From processing folder
grep DIGITAL_VLAANDEREN_API_KEY ../.env

# Or from project root
grep DIGITAL_VLAANDEREN_API_KEY .env
```

## Performance Tips

1. **OSM Import**: Use SSD storage for cache directory
2. **GRB Import**: ogr2ogr automatically uses all CPU cores
3. **PostgreSQL**: Allocate at least 4GB RAM for import operations
4. **Disk Space**: Reserve 50GB for full Belgium dataset (GRB + OSM)

## Migration from Old Rust-Based System

If you have old Rust processing code, it's no longer needed. The new system uses:
- **imposm3** instead of custom OSM parser
- **ogr2ogr** instead of custom GDAL wrapper
- **SQL** instead of custom tag transformation logic

Benefits:
- ✅ Simpler to maintain (no Rust compilation)
- ✅ Faster processing (battle-tested tools)
- ✅ Better error handling
- ✅ Industry-standard workflow

## See Also

- [imposm3 Documentation](https://imposm.org/docs/imposm3/latest/)
- [GDAL/ogr2ogr Documentation](https://gdal.org/programs/ogr2ogr.html)
- [Just Task Runner](https://github.com/casey/just)
- [Digital Vlaanderen API](https://api.vlaanderen.be/)
