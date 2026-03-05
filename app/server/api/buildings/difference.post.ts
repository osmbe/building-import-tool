import { queryGrb, queryOsm } from '~/server/utils/db'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { bounds, matchMode = 'geometry' } = body

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

    const [minX, minY, maxX, maxY] = bounds

    // Build query based on match mode
    let grbRows: any[]
    let totalOsm = 0

    if (matchMode === 'source') {
      // Source tag matching: Show GRB buildings that DON'T have matching OSM source:geometry:oidn

      console.log('[SOURCE MODE] Query bounds:', { minX, minY, maxX, maxY })

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

      console.log('[SOURCE MODE] Found OSM buildings with source:geometry:oidn:', totalOsm)
      console.log('[SOURCE MODE] OIDNs to exclude:', oidnList.slice(0, 10), oidnList.length > 10 ? `... and ${oidnList.length - 10} more` : '')
      console.log('[SOURCE MODE] Is 1021532 in exclusion list?', oidnList.includes('1021532'))

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

      grbRows = await queryGrb(grbQuery, [minX, minY, maxX, maxY, totalOsm, oidnList.length > 0 ? oidnList : ['-1']])

      console.log('[SOURCE MODE] GRB polygons returned:', grbRows.length)
      const returnedOidns = grbRows.map((row: any) => row.oidn)
      console.log('[SOURCE MODE] First 10 oidns returned:', returnedOidns.slice(0, 10))
      console.log('[SOURCE MODE] Is 1021532 in returned oidns?', returnedOidns.includes('1021532') || returnedOidns.includes(1021532))
    } else {
      // Geometry matching: Show all GRB polygons (original behavior)
      const candidateQuery = `
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
          0::bigint AS total_osm
        FROM grb.building_polygons bp, envelope_4326 e
        WHERE bp.geom && e.env
          AND ST_Intersects(bp.geom, e.env)
        ORDER BY bp.oidn;
      `

      grbRows = await queryGrb(candidateQuery, [minX, minY, maxX, maxY])
    }

    const totalGrb = grbRows[0]?.total_grb || 0
    if (matchMode === 'geometry') {
      totalOsm = grbRows[0]?.total_osm || 0
    }

    const candidateFeatures = grbRows.map((row: any) => {
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