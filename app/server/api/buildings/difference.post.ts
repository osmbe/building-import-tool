import { queryGrb, queryOsm } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { bounds, matchMode = 'geometry', dataSource = 'grb' } = body

    if (!bounds || bounds.length !== 4) {
      return sendError(event, createError({
        statusCode: 400,
        statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]'
      }))
    }

    if (matchMode !== 'geometry' && matchMode !== 'source') {
      return sendError(event, createError({
        statusCode: 400,
        statusMessage: 'Invalid matchMode. Expected "geometry" or "source"'
      }))
    }

    if (dataSource !== 'grb' && dataSource !== 'picc') {
      return sendError(event, createError({
        statusCode: 400,
        statusMessage: 'Invalid dataSource. Expected "grb" or "picc"'
      }))
    }

    // Source tag matching only works for GRB (PICC has no source:geometry:oidn tags in OSM)
    if (matchMode === 'source' && dataSource === 'picc') {
      return sendError(event, createError({
        statusCode: 400,
        statusMessage: 'Source tag matching is only available for GRB data. Use geometry mode for PICC.'
      }))
    }

    const [minX, minY, maxX, maxY] = bounds

    let rows: any[]
    let totalOsm = 0

    if (matchMode === 'source') {
      // Source tag matching (GRB only): Show GRB buildings that DON'T have matching OSM source:geometry:oidn

      // Step 1: Get OSM buildings with source:geometry:oidn in the extent
      const osmQuery = `
        SELECT DISTINCT
          tags->>'source:geometry:oidn' AS oidn
        FROM osm.osm_buildings
        WHERE geom_mercator && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(geom_mercator, ST_MakeEnvelope($1, $2, $3, $4, 3857))
          AND tags ? 'source:geometry:oidn'
      `

      const osmRows = await queryOsm(osmQuery, [minX, minY, maxX, maxY])
      const oidnList = osmRows.map((row: any) => row.oidn).filter(Boolean)
      totalOsm = oidnList.length

      // Step 2: Get GRB polygons that DON'T have matching OIDNs
      const grbQuery = `
        WITH
          envelope_4326 AS (
            SELECT ST_Transform(
                     ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326
                   ) AS env
          )
        SELECT
          ST_AsGeoJSON(bp.geom) AS geometry,
          bp.oidn,
          bp.gebouw_id,
          COUNT(*) OVER() AS total_grb,
          $5::bigint AS total_osm
        FROM grb.building_polygons bp, envelope_4326 e
        WHERE bp.geom && e.env
          AND ST_Intersects(bp.geom, e.env)
          AND bp.oidn::text != ALL($6::text[])
        ORDER BY bp.oidn;
      `

      rows = await queryGrb(grbQuery, [minX, minY, maxX, maxY, totalOsm, oidnList.length > 0 ? oidnList : ['-1']])

    } else if (dataSource === 'grb') {
      // Geometry matching for GRB: GRB polygons with no corresponding OSM building
      // A match = intersection area >= 50% of the smaller building's area
      //
      // Two-step approach to avoid FDW overhead:
      // 1. Fetch OSM geometries directly from osmbe (uses local GIST index)
      // 2. Pass collected geometry to GRB comparison query (all local operations)
      const osmResult = await queryOsm(`
        SELECT
          ST_AsGeoJSON(ST_Collect(geom)) AS geom_collection,
          COUNT(*) AS total_osm
        FROM osm.osm_buildings
        WHERE geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
          AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
      `, [minX, minY, maxX, maxY])

      const osmGeomCollection = osmResult[0]?.geom_collection
      totalOsm = parseInt(osmResult[0]?.total_osm || '0')

      if (!osmGeomCollection) {
        // No OSM buildings in extent — all GRB buildings are candidates
        rows = await queryGrb(`
          SELECT
            ST_AsGeoJSON(bp.geom) AS geometry,
            bp.oidn,
            bp.gebouw_id,
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM grb.building_polygons bp
          WHERE bp.geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(bp.geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
          ORDER BY bp.oidn
        `, [minX, minY, maxX, maxY])
      } else {
        rows = await queryGrb(`
          WITH
            envelope_4326 AS (
              SELECT ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326) AS env
            ),
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))).geom AS geom
            ),
            grb_in_extent AS (
              SELECT bp.geom, bp.oidn, bp.gebouw_id
              FROM grb.building_polygons bp, envelope_4326 e
              WHERE bp.geom && e.env
                AND ST_Intersects(bp.geom, e.env)
            )
          SELECT
            ST_AsGeoJSON(g.geom) AS geometry,
            g.oidn,
            g.gebouw_id,
            (SELECT COUNT(*) FROM grb_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM grb_in_extent g
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE g.geom && o.geom
              AND ST_Intersects(g.geom, o.geom)
              AND ST_Area(ST_Intersection(g.geom, o.geom))
                  / NULLIF(LEAST(ST_Area(g.geom), ST_Area(o.geom)), 0) >= 0.5
          )
          ORDER BY g.oidn
        `, [minX, minY, maxX, maxY, osmGeomCollection, totalOsm])
      }

    } else {
      // Geometry matching for PICC: uses picc.buildings_with_addresses matview (EPSG:3857)
      // Two-step approach: fetch OSM geometries directly from osmbe to avoid FDW overhead
      const osmResult = await queryOsm(`
        SELECT
          ST_AsGeoJSON(ST_Collect(geom_mercator)) AS geom_collection,
          COUNT(*) AS total_osm
        FROM osm.osm_buildings
        WHERE geom_mercator && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(geom_mercator, ST_MakeEnvelope($1, $2, $3, $4, 3857))
      `, [minX, minY, maxX, maxY])

      const osmGeomCollection = osmResult[0]?.geom_collection
      totalOsm = parseInt(osmResult[0]?.total_osm || '0')

      if (!osmGeomCollection) {
        rows = await queryGrb(`
          SELECT
            ST_AsGeoJSON(ST_Transform(b.geom, 4326)) AS geometry,
            b.objectid,
            b.natur_code,
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM picc.buildings_with_addresses b
          WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
            AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
          ORDER BY b.objectid
        `, [minX, minY, maxX, maxY])
      } else {
        rows = await queryGrb(`
          WITH
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 3857))).geom AS geom
            ),
            picc_in_extent AS (
              SELECT b.geom, b.objectid, b.natur_code
              FROM picc.buildings_with_addresses b
              WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
                AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
            )
          SELECT
            ST_AsGeoJSON(ST_Transform(p.geom, 4326)) AS geometry,
            p.objectid,
            p.natur_code,
            (SELECT COUNT(*) FROM picc_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM picc_in_extent p
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE p.geom && o.geom
              AND ST_Intersects(p.geom, o.geom)
              AND ST_Area(ST_Intersection(p.geom, o.geom))
                  / NULLIF(LEAST(ST_Area(p.geom), ST_Area(o.geom)), 0) >= 0.5
          )
          ORDER BY p.objectid
        `, [minX, minY, maxX, maxY, osmGeomCollection, totalOsm])
      }
    }

    const totalGrb = rows[0]?.total_grb || 0
    if (matchMode === 'geometry') {
      totalOsm = rows[0]?.total_osm || 0
    }

    const candidateFeatures = rows.map((row: any) => {
      const geometry = JSON.parse(row.geometry)

      // Extract all properties except geometry and internal stats
      const { geometry: _, total_grb: _total_grb, total_osm: _total_osm, ...properties } = row

      return {
        type: 'Feature',
        geometry,
        properties
      }
    })

    return {
      type: 'FeatureCollection',
      features: candidateFeatures,
      stats: {
        total: candidateFeatures.length,
        totalGrb,
        totalOsm,
        dataSource,
        bounds
      }
    }

  } catch (error) {
    console.error('Error in buildings/difference endpoint:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return sendError(event, createError({
      statusCode: 500,
      statusMessage: `Error calculating difference: ${error instanceof Error ? error.message : JSON.stringify(error)}`
    }))
  }
})
