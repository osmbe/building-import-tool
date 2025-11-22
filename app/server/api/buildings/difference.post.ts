import { queryGrb } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { bounds } = body

    if (!bounds || bounds.length !== 4) {
      return sendError(event, createError({
        statusCode: 400,
        statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]'
      }))
    }

    const [minX, minY, maxX, maxY] = bounds

    const candidateQuery = `
      WITH 
        envelope_4326 AS (
          SELECT ST_Transform(
                   ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326
                 ) AS env
        ),
        grb_in_extent AS MATERIALIZED (
          SELECT
            g.*
          FROM grb.buildings g, envelope_4326 e
          WHERE g.geom && e.env
            AND ST_Intersects(g.geom, e.env)
        ),
        osm_in_extent AS MATERIALIZED (
          SELECT
            o.geometry AS geom_3857
          FROM osm_remote.osm_buildings_local o, envelope_4326 e
          WHERE o.geometry && ST_MakeEnvelope($1, $2, $3, $4, 3857)
            AND ST_Intersects(o.geometry, ST_MakeEnvelope($1, $2, $3, $4, 3857))
        )
      SELECT
        ST_AsGeoJSON(g.geom) AS geometry,
        g.gebouw_id,
        g.polygon_count,
        g.total_area_m2,
        g.type_label,
        COUNT(*) OVER() AS total_grb,
        (SELECT COUNT(*) FROM osm_in_extent) AS total_osm
      FROM grb_in_extent g
      ORDER BY g.gebouw_id;
    `

    const grbRows = await queryGrb(candidateQuery, [minX, minY, maxX, maxY])

    const totalGrb = grbRows[0]?.total_grb || 0
    const totalOsm = grbRows[0]?.total_osm || 0

    const candidateFeatures = grbRows.map((row: any) => {
      const geometry = JSON.parse(row.geometry)

      // Extract all properties except geometry and internal stats
      const { geometry: _, total_grb, total_osm, ...properties } = row

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
        bounds
      }
    }

  } catch (error) {
    console.error('Error in buildings/difference endpoint:', error)
    return sendError(event, createError({
      statusCode: 500,
      statusMessage: `Error calculating difference: ${error instanceof Error ? error.message : 'Unknown error'}`
    }))
  }
})