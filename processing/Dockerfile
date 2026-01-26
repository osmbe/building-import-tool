# BE2OSM Data Processing Container
# Includes ogr2ogr (GDAL), imposm3, PostgreSQL client, and Just task runner
#
# Build: docker build -t be2osm-processing .
# Run:   docker run -it --rm -v $(pwd):/work -v $(pwd)/../.env:/work/.env be2osm-processing
# Use 22 instead of 24 to avoid issues with some dependencies
FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/Brussels

# Install base dependencies
RUN apt-get update && apt-get install -y \
    # Core tools
    curl \
    wget \
    unzip \
    jq \
    ca-certificates \
    gnupg \
    lsb-release \
    # PostgreSQL client (for psql)
    postgresql-client \
    # GDAL/OGR tools (includes ogr2ogr)
    gdal-bin \
    libgdal-dev \
    python3-gdal \
    # LevelDB (required by imposm3)
    libleveldb-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Just task runner
RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Install imposm3 (only available for x86-64, skip on ARM)
ENV IMPOSM_VERSION=0.11.1
RUN if [ "$(uname -m)" = "x86_64" ]; then \
        wget -q https://github.com/omniscale/imposm3/releases/download/v${IMPOSM_VERSION}/imposm-${IMPOSM_VERSION}-linux-x86-64.tar.gz \
        && tar -xzf imposm-${IMPOSM_VERSION}-linux-x86-64.tar.gz \
        && mv imposm-${IMPOSM_VERSION}-linux-x86-64/imposm /usr/local/bin/ \
        && rm -rf imposm-${IMPOSM_VERSION}-linux-x86-64* \
        && chmod +x /usr/local/bin/imposm; \
    else \
        echo "Skipping imposm3 installation (only available for x86-64)"; \
    fi

# Verify installations
RUN echo "=== Installed versions ===" \
    && ogr2ogr --version \
    && (imposm version 2>/dev/null || echo "imposm: not installed (ARM architecture)") \
    && psql --version \
    && just --version \
    && jq --version

# Set working directory
WORKDIR /work

# Set default shell to bash
SHELL ["/bin/bash", "-c"]

# Default command shows help
CMD ["just"]

# Default environment variables for database connection
# Override these when running the container
ENV DB_HOST=localhost \
    DB_PORT=5432 \
    DB_USER=be2osm

# Labels
LABEL org.opencontainers.image.title="BE2OSM Data Processing" \
      org.opencontainers.image.description="Container with ogr2ogr, imposm3, and processing tools" \
      org.opencontainers.image.version="1.0" \
      org.opencontainers.image.vendor="BE2OSM"
