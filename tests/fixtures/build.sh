#!/usr/bin/env bash
# Convert the GeoJSON/CSV fixtures (feature ids are top-level GeoJSON "id" members, kept with -preserve_fid) into the file formats and directory layout the import recipes expect.
# Runs inside the processing container (ogr2ogr): /fixtures is this directory, /work/data the recipes' data dir.
#
#   build.sh grb|picc|urbis
set -euo pipefail

SRC=/fixtures
DATA=/work/data
LAMBERT=EPSG:31370 # native CRS of GRB, PICC and Urbis downloads

shp() { # <geojson> <out.shp>
    ogr2ogr -f "ESRI Shapefile" "$2" "$1" -t_srs "$LAMBERT" -lco ENCODING=UTF-8
}

dbf() { # <csv> <out.dbf>: attribute-only DBF, like the GRB relation files
    ogr2ogr -f "ESRI Shapefile" "$2" "$1" -oo AUTODETECT_TYPE=YES
}

case "${1:?usage: build.sh grb|picc|urbis}" in
grb)
    rm -rf "$DATA/grb" && mkdir -p "$DATA/grb"/{gbg,gba,knw,addresses}
    shp "$SRC/grb/gbg.geojson" "$DATA/grb/gbg/Gbg_test.shp"
    dbf "$SRC/grb/rlt_gbg_gebouw.csv" "$DATA/grb/gbg/RltGbgGebouw_test.dbf"
    shp "$SRC/grb/gba.geojson" "$DATA/grb/gba/Gba_test.shp"
    shp "$SRC/grb/knw.geojson" "$DATA/grb/knw/Knw_test.shp"
    shp "$SRC/grb/addresses.geojson" "$DATA/grb/addresses/Adres_test.shp"
    dbf "$SRC/grb/rlt_adres_gebouw.csv" "$DATA/grb/addresses/RltAdresGebouw_test.dbf"
    ;;
picc)
    rm -rf "$DATA/picc" && mkdir -p "$DATA/picc"
    # FileGDB with the CONSTR_BATIEMPRISE layer, like the SPW download (the feature id becomes OBJECTID)
    ogr2ogr -f OpenFileGDB "$DATA/picc/PICC_test.gdb" "$SRC/picc/buildings.geojson" -t_srs "$LAMBERT" \
        -nln CONSTR_BATIEMPRISE -nlt MULTIPOLYGON -preserve_fid -lco FID=OBJECTID
    shp "$SRC/picc/icar.geojson" "$DATA/picc/ICAR_test.shp"
    ;;
urbis)
    rm -rf "$DATA/urbis" && mkdir -p "$DATA/urbis"
    GPKG="$DATA/urbis/UrbIS_test.gpkg"
    ogr2ogr -f GPKG "$GPKG" "$SRC/urbis/buildings.geojson" -t_srs "$LAMBERT" -nln Buildings -nlt MULTIPOLYGON -preserve_fid
    ogr2ogr -f GPKG -update "$GPKG" "$SRC/urbis/addresses.geojson" -t_srs "$LAMBERT" -nln Addresses -preserve_fid
    ogr2ogr -f GPKG -update "$GPKG" "$SRC/urbis/placenames.geojson" -nln PlaceNames -nlt NONE -preserve_fid
    ogr2ogr -f GPKG -update "$GPKG" "$SRC/urbis/municipalities.geojson" -t_srs "$LAMBERT" -nln Municipalities -preserve_fid
    ogr2ogr -f GPKG -update "$GPKG" "$SRC/urbis/postalzip.geojson" -nln PostalZip -nlt NONE -preserve_fid
    ;;
*)
    echo "unknown fixture set: $1" >&2
    exit 2
    ;;
esac

echo "fixtures ready: $1"
