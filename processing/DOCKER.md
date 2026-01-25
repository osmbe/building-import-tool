# Docker Usage for BE2OSM Processing

This document explains how to use the containerized processing environment.

## Why Use Docker?

The Docker container provides:
- ✅ **ogr2ogr** (GDAL) for shapefile processing
- ✅ **imposm3** for OSM data import
- ✅ **PostgreSQL client** (psql) for database operations
- ✅ **Just** task runner
- ✅ **All dependencies** pre-installed and configured

Perfect for environments where installing these tools is difficult or for consistent execution across different systems.

## Quick Start

### 1. Build the Image

```bash
# From project root
docker compose build processing
```

**Build time**: ~2-3 minutes (downloads and installs all tools)

### 2. Run Tasks

**Important**: The processing service is defined in the **root** `docker-compose.yml`, not in the processing folder.

```bash
# From project root
# Interactive mode - opens shell in container
docker compose run --rm --profile processing processing bash

# Run specific task
docker compose run --rm --profile processing processing just osm-download
docker compose run --rm --profile processing processing just osm-import
docker compose run --rm --profile processing processing just grb-full
```

## Usage Patterns

**Note**: All commands should be run from the **project root**, not the processing folder.

### Interactive Shell

Open a shell inside the container to run multiple commands:

```bash
# From project root
docker compose run --rm --profile processing processing bash

# Inside container:
just osm-download
just osm-import
just grb-status
exit
```

### One-Shot Tasks

Run a single task and exit:

```bash
# From project root

# OSM tasks
docker compose run --rm --profile processing processing just osm-download
docker compose run --rm --profile processing processing just osm-import
docker compose run --rm --profile processing processing just osm-status

# GRB tasks
docker compose run --rm --profile processing processing just grb-order-all
docker compose run --rm --profile processing processing just grb-download-all
docker compose run --rm --profile processing processing just grb-import

# Database tasks
docker compose run --rm --profile processing processing just db-optimize
docker compose run --rm --profile processing processing just db-sizes
```

### Background Service

Keep the container running for repeated use:

```bash
# From project root

# Start container in background
docker compose --profile processing up -d processing

# Run commands in running container
docker compose exec processing just osm-download
docker compose exec processing just db-status

# Stop when done
docker compose down
```

## Configuration

### Environment Variables

The container automatically loads from `.env` (root .env file):

```bash
# Ensure your root .env has these variables:
POSTGRES_USER=be2osm
POSTGRES_PASSWORD=your_password
DIGITAL_VLAANDEREN_API_KEY=your_api_key
```

### Database Connection

The container connects to PostgreSQL running on the **host machine** (not a containerized database):

```bash
# The processing service automatically connects to:
DB_HOST=host.docker.internal  # Special hostname for the Docker host
DB_PORT=5432                  # PostgreSQL on host machine
DB_USER=${POSTGRES_USER}
DB_PASSWORD=${POSTGRES_PASSWORD}
```

**Requirements**:
- PostgreSQL must be running on your host machine on port 5432
- Database must be accessible from Docker containers
- The `extra_hosts` configuration in docker-compose.yml enables `host.docker.internal` on Linux

### Volume Mounts

The root docker-compose.yml mounts:
- `./processing` → `/work` - Your processing directory
- `./.env` → `/work/.env` - Root configuration (read-only)
- `./processing/data` → `/work/data` - Data files (persistent)
- `./processing/logs` → `/work/logs` - Log files (persistent)

## Examples

All commands should be run from the **project root**.

### Complete OSM Import

```bash
# Download OSM data
docker compose run --rm --profile processing processing just osm-download

# Import to database
docker compose run --rm --profile processing processing just osm-import

# Check status
docker compose run --rm --profile processing processing just osm-status
```

### Complete GRB Import

```bash
# Full workflow (order → wait → download → import)
docker compose run --rm --profile processing processing just grb-full

# Or step by step:
docker compose run --rm --profile processing processing just grb-order-all
# Wait 10-30 minutes for orders to process
docker compose run --rm --profile processing processing just grb-status-orders
docker compose run --rm --profile processing processing just grb-download-all
docker compose run --rm --profile processing processing just grb-import
```

### Database Access

```bash
# Open PostgreSQL shell (connects to host machine's PostgreSQL)
docker compose run --rm --profile processing processing bash
psql -h host.docker.internal -p 5432 -U be2osm -d osmbe
```

**Note**: Database schemas are automatically created by PostgreSQL init scripts in the `postgres/` folder when the database container starts.

## Troubleshooting

### Cannot Connect to Database

**Error**: `psql: could not connect to server`

**Solutions**:

1. **Check PostgreSQL is running on host machine**:
   ```bash
   # On host machine
   psql -h localhost -p 5432 -U be2osm -d osmbe
   # or
   pg_isready -h localhost -p 5432
   ```

2. **Verify PostgreSQL accepts connections from Docker**:
   ```bash
   # Check postgresql.conf has:
   listen_addresses = '*'

   # Check pg_hba.conf allows Docker subnet:
   host all all 172.16.0.0/12 md5
   ```

3. **Test connectivity from container**:
   ```bash
   # From project root
   docker compose run --rm --profile processing processing ping -c 1 host.docker.internal
   docker compose run --rm --profile processing processing psql -h host.docker.internal -p 5432 -U be2osm -l
   ```

4. **Check .env configuration**:
   ```bash
   # From project root
   docker compose run --rm --profile processing processing env | grep DB_
   ```

### Permission Denied on Data Directory

**Error**: `Permission denied: '/work/data/osm'`

**Solution**: Fix permissions on host:
```bash
chmod -R 755 data/
chown -R $USER:$USER data/
```

### imposm3 Cache Issues

**Error**: `cannot create cache directory`

**Solution**: Clear cache and ensure permissions:
```bash
# From project root
docker compose run --rm --profile processing processing just clean-osm-cache
mkdir -p processing/data/osm/imposm-cache
chmod 755 processing/data/osm/imposm-cache
```

## Performance

### Disk Space

The container image is ~500MB. Ensure you have enough space for:
- Container image: ~500MB
- OSM data (Belgium): ~1.5GB
- GRB data: ~5GB
- Database: ~10GB
- Total recommended: **20GB+**

### Memory

Recommended resources:
- **Minimum**: 2GB RAM
- **Recommended**: 4GB RAM
- **Optimal**: 8GB RAM (for large imports)

Configure in Docker Desktop: Settings → Resources

### CPU

The tools utilize multiple cores:
- ogr2ogr: Auto-detects and uses all cores
- imposm3: Configurable with `-concurrency` flag
- Recommended: 4+ cores for faster imports

## Building Custom Image

If you need additional tools:

```dockerfile
# Extend the base image
FROM be2osm-processing:latest

# Install additional tools
RUN apt-get update && apt-get install -y \
    your-tool \
    && rm -rf /var/lib/apt/lists/*
```

Build:
```bash
docker build -f Dockerfile.custom -t be2osm-processing:custom .
```

## Comparison: Docker vs Native

| Feature | Docker | Native |
|---------|--------|--------|
| Setup time | 2-3 min (build) | 5-10 min (install tools) |
| Dependencies | All included | Manual install |
| Consistency | Same everywhere | Varies by system |
| Performance | Slight overhead (~5%) | Native speed |
| Isolation | Sandboxed | Uses system tools |

**Recommendation**:
- Use **Docker** for: Deployment, CI/CD, consistency, quick setup
- Use **Native** for: Development, maximum performance, debugging

## See Also

- [Main README](README.md) - Native installation and usage
- [Dockerfile](Dockerfile) - Container configuration
- [Root docker-compose.yml](../docker-compose.yml) - Service definitions (processing service defined here)
