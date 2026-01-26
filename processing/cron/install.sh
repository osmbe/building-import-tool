#!/bin/bash
# Install BE2OSM cron jobs

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-/opt/docker/buildings}"
LOG_DIR="/var/log/be2osm"

echo "=== BE2OSM Cron Setup ==="
echo ""

# Create log directory
if [ ! -d "$LOG_DIR" ]; then
    echo "Creating log directory: $LOG_DIR"
    sudo mkdir -p "$LOG_DIR"
    sudo chown "$(whoami):$(whoami)" "$LOG_DIR"
fi

# Generate crontab with correct project directory
TEMP_CRONTAB=$(mktemp)
sed "s|PROJECT_DIR=.*|PROJECT_DIR=$PROJECT_DIR|g" "$SCRIPT_DIR/crontab" > "$TEMP_CRONTAB"

echo "Installing cron jobs..."
echo ""
echo "Schedule:"
echo "  - OSM update: Daily at 4:00 AM UTC"
echo "  - GRB update: Sunday at 5:00 AM UTC"
echo "  - DB optimize: Daily at 6:00 AM UTC"
echo ""
echo "Logs: $LOG_DIR/"
echo ""

# Check if user wants to merge or replace
if crontab -l 2>/dev/null | grep -q "BE2OSM"; then
    echo "Existing BE2OSM cron jobs found."
    read -p "Replace existing jobs? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove old BE2OSM entries and add new ones
        (crontab -l 2>/dev/null | grep -v "BE2OSM\|osm-update\|grb-update\|db-optimize" || true; cat "$TEMP_CRONTAB") | crontab -
        echo "Cron jobs updated."
    else
        echo "Cancelled."
        rm "$TEMP_CRONTAB"
        exit 0
    fi
else
    # Add to existing crontab
    (crontab -l 2>/dev/null || true; cat "$TEMP_CRONTAB") | crontab -
    echo "Cron jobs installed."
fi

rm "$TEMP_CRONTAB"

echo ""
echo "Verify with: crontab -l"
echo "View logs with: tail -f $LOG_DIR/*.log"
