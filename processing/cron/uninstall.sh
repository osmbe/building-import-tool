#!/bin/bash
# Remove BE2OSM cron jobs

echo "Removing BE2OSM cron jobs..."

if crontab -l 2>/dev/null | grep -q "BE2OSM"; then
    crontab -l | grep -v "BE2OSM\|osm-update\|grb-update\|db-optimize" | crontab -
    echo "Cron jobs removed."
else
    echo "No BE2OSM cron jobs found."
fi

echo ""
echo "Verify with: crontab -l"
