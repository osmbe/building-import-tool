# BE2OSM Data Processing Container
# Includes ogr2ogr (GDAL), imposm3, PostgreSQL client, and Just task runner
#
# Build: docker build -t be2osm-processing .
# Run:   docker run -it --rm -v $(pwd):/work -v $(pwd)/../.env:/work/.env be2osm-processing
FROM ubuntu:24.04

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
    # GEOS (required by imposm3)
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/* \
    # Symlink: imposm3 expects libleveldb.so.1, find actual library and link it
    && ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then LIB_DIR="/usr/lib/x86_64-linux-gnu"; \
       elif [ "$ARCH" = "aarch64" ]; then LIB_DIR="/usr/lib/aarch64-linux-gnu"; \
       else LIB_DIR="/usr/lib"; fi \
    && ln -sf $(ls ${LIB_DIR}/libleveldb.so.1* 2>/dev/null | head -1) ${LIB_DIR}/libleveldb.so.1 || true

# Install Just task runner
RUN curl --proto '=https' --tlsv1.2 -sSf https://just.systems/install.sh | bash -s -- --to /usr/local/bin

# Install Go (needed for building imposm3 on arm64)
ENV GO_VERSION=1.21.5
RUN ARCH=$(uname -m) \
    && if [ "$ARCH" = "aarch64" ]; then \
        wget -q https://go.dev/dl/go${GO_VERSION}.linux-arm64.tar.gz \
        && tar -C /usr/local -xzf go${GO_VERSION}.linux-arm64.tar.gz \
        && rm go${GO_VERSION}.linux-arm64.tar.gz; \
    fi
ENV PATH="/usr/local/go/bin:${PATH}"

# Install imposm3 - download binary for x86-64, build from source for arm64
ENV IMPOSM_VERSION=0.14.2
RUN ARCH=$(uname -m) \
    && if [ "$ARCH" = "x86_64" ]; then \
        wget -q https://github.com/omniscale/imposm3/releases/download/v${IMPOSM_VERSION}/imposm-${IMPOSM_VERSION}-linux-x86-64.tar.gz \
        && tar -xzf imposm-${IMPOSM_VERSION}-linux-x86-64.tar.gz \
        && mv imposm-${IMPOSM_VERSION}-linux-x86-64/imposm /usr/local/bin/ \
        && rm -rf imposm-${IMPOSM_VERSION}-linux-x86-64* \
        && chmod +x /usr/local/bin/imposm; \
    elif [ "$ARCH" = "aarch64" ]; then \
        echo "Building imposm3 from source for arm64..." \
        && apt-get update && apt-get install -y git build-essential \
        && git clone --depth 1 --branch v${IMPOSM_VERSION} https://github.com/omniscale/imposm3.git /tmp/imposm3 \
        && cd /tmp/imposm3 \
        && go build -o /usr/local/bin/imposm ./cmd/imposm \
        && rm -rf /tmp/imposm3 \
        && apt-get purge -y git build-essential \
        && apt-get autoremove -y \
        && rm -rf /var/lib/apt/lists/*; \
    fi

# Verify installations (imposm must work - fail build if it doesn't)
RUN echo "=== Installed versions ===" \
    && ogr2ogr --version \
    && psql --version \
    && just --version \
    && jq --version \
    && echo "=== Verifying imposm3 ===" \
    && imposm version

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
