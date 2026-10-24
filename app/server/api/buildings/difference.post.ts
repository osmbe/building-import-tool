import { queryGrb, queryOsm } from '~/server/utils/db'
import { BUILDING_TYPE_LABELS } from '~/utils/grbExportTags'
import { CANDIDATES_CONTRACT, CANDIDATE_COLUMNS, CANDIDATE_VIEWS, isCandidateSource } from '~/utils/candidates'
import { type OsmSourceOidnInput, collectOsmSourceRefs } from '~/utils/osmSourceOidn'
import { type OverpassBuildings, OverpassError, fetchOverpassBuildings } from '~/server/utils/overpass'

// Official buildings in view that have no match in OSM, for every source through the candidates contract
// (grb.candidates, grb.knw_candidates, picc.candidates, urbis.candidates: utils/candidates.ts). Every feature
// Carries the contract properties.
//
// Match modes:
// - geometry: a candidate is matched by an OSM building that covers at least geometryThreshold of the candidate
//   And of which the candidate covers at least as much (both directions, in EPSG:3857);
// - source (GRB only): matched by an OSM building in view that references it (source:geometry:ref "Gbg/123");
// - both: a candidate must be unmatched in both ways.
export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const {
      bounds,
      matchMode = 'geometry',
      dataSource = 'grb',
      geometryThreshold = 0.7,
      useOverpass = false,
      contract
    } = body

    // Pages loaded before the contract (properties named per source) must not export these features
    if (contract !== CANDIDATES_CONTRACT) 
      {  sendError(
        event,
        createError({ statusCode: 409, statusMessage: 'BE2OSM was updated: reload the page to use the new version' })
      ); return; }
    

    if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((v) => Number.isFinite(Number(v)))) 
      {  sendError(
        event,
        createError({ statusCode: 400, statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]' })
      ); return; }
    

    if (matchMode !== 'geometry' && matchMode !== 'source' && matchMode !== 'both') 
      {  sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid matchMode. Expected "geometry", "source", or "both"'
        })
      ); return; }
    

    if (!isCandidateSource(dataSource)) 
      {  sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid dataSource. Expected "grb", "knw", "picc", or "urbis"'
        })
      ); return; }
    

    const threshold = Number(geometryThreshold)
    if (Number.isNaN(threshold) || threshold < 0.3 || threshold > 0.95) 
      {  sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid geometryThreshold. Expected a number between 0.3 and 0.95'
        })
      ); return; }
    

    // Only GRB objects are referenced from OSM (source:geometry:ref)
    if ((matchMode === 'source' || matchMode === 'both') && dataSource !== 'grb') 
      {  sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Source tag matching is only available for GRB data. Use geometry mode for KNW/PICC/UrbIS.'
        })
      ); return; }
    

    const [minX, minY, maxX, maxY] = (bounds as unknown[]).map(Number) as [number, number, number, number]
    const useGeometry = matchMode !== 'source'
    const useRefs = matchMode !== 'geometry'

    // Issue #9: OSM buildings live from Overpass instead of the Postgres mirror (opt-in)
    const overpass: OverpassBuildings | null = useOverpass
      ? await fetchOverpassBuildings([minX, minY, maxX, maxY])
      : null

    // OSM outlines in view, as one EPSG:3857 collection, for geometry matching. Fetched from osmbe directly
    // (no FDW) and passed to the be2osm query as GeoJSON.
    let osmGeometries: string | null = null
    let totalOsm = 0
    if (useGeometry) 
      if (overpass) {
        osmGeometries = overpass.geomCollection3857
        totalOsm = overpass.totalOsm
      } else {
        const osm = await queryOsm(
          `
          SELECT ST_AsGeoJSON(ST_Collect(COALESCE(geom_mercator, ST_Transform(geom, 3857)))) AS geom_collection,
                 COUNT(*) AS total_osm
          FROM osm.osm_buildings
          WHERE geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
        `,
          [minX, minY, maxX, maxY]
        )
        osmGeometries = osm[0]?.geom_collection ?? null
        totalOsm = Number(osm[0]?.total_osm ?? 0)
      }
    

    // The GRB references ("Gbg/123") of the OSM buildings in view. Parsing (";"-separated refs, leading zeros,
    // The older source:geometry:oidn + entity tags) is in collectOsmSourceRefs, unit-tested (issue #52).
    let sourceRefs: string[] = []
    if (useRefs) {
      if (overpass) 
        sourceRefs = overpass.sourceRefs
       else {
        const osm = await queryOsm(
          `
          SELECT DISTINCT
            tags->>'source:geometry:oidn' AS oidn,
            tags->>'source:geometry:ref' AS ref,
            tags->>'source:geometry:entity' AS entity
          FROM osm.osm_buildings
          WHERE geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
            AND (tags ? 'source:geometry:oidn' OR tags ? 'source:geometry:ref')
        `,
          [minX, minY, maxX, maxY]
        )
        sourceRefs = collectOsmSourceRefs(osm as OsmSourceOidnInput[])
      }
      // Source mode reports the referenced objects as its OSM count
      if (!useGeometry) totalOsm = sourceRefs.length
    }

    const params: unknown[] = [minX, minY, maxX, maxY]
    const param = (value: unknown) => {
      params.push(value)
      return `$${params.length}`
    }
    // Issue #53: GRB building pre-filtering on the type label (LBLTYPE). Only gbg-1/gbg-2 (hoofdgebouw,
    // Bijgebouw) and gba-1 (verdieping, exported with a fixme) are building candidates; unlabelled polygons stay.
    const inScope =
      dataSource === 'grb'
        ? `(coalesce(lower(c.type_label), '') = '' OR lower(c.type_label) = ANY(${param([...BUILDING_TYPE_LABELS])}::text[]))`
        : 'TRUE'
    const countParams = [...params]
    const view = CANDIDATE_VIEWS[dataSource]
    const inView = `c.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857) AND ST_Intersects(c.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))`

    const conditions = [inView, inScope]
    if (useRefs) 
      // Candidates without a reference (NULL) are never matched by one
      conditions.push(`coalesce(c.source_ref <> ALL(${param(sourceRefs)}::text[]), TRUE)`)
    
    let osmCte = ''
    if (useGeometry && osmGeometries) {
      osmCte = `WITH osm AS (SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON(${param(osmGeometries)}), 3857))).geom AS geom)`
      const t = param(threshold)
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM osm o
        WHERE c.geom && o.geom
          AND ST_Intersects(c.geom, o.geom)
          AND ST_Area(ST_Intersection(c.geom, o.geom)) / NULLIF(ST_Area(c.geom), 0) >= ${t}
          AND ST_Area(ST_Intersection(c.geom, o.geom)) / NULLIF(ST_Area(o.geom), 0) >= ${t}
      )`)
    }

    const rows = await queryGrb(
      `
      ${osmCte}
      SELECT ST_AsGeoJSON(ST_Transform(c.geom, 4326)) AS geometry, ${CANDIDATE_COLUMNS.map((col) => `c.${col}`).join(', ')}
      FROM ${view} c
      WHERE ${conditions.join('\n        AND ')}
      -- By entity, then by id in numeric order (ids are numbers without leading zeros): the export order
      ORDER BY c.entity, length(c.source_id), c.source_id
    `,
      params
    )

    // Source objects in view, counted apart from the candidates so the matched/coverage stats stay right when
    // Every object is already in OSM (no candidate rows) and in source mode
    const count = await queryGrb(`SELECT COUNT(*) AS n FROM ${view} c WHERE ${inView} AND ${inScope}`, countParams)

    const features = rows.map(({ geometry, ...properties }: { geometry: string } & Record<string, unknown>) => ({
      geometry: JSON.parse(geometry),
      properties,
      type: 'Feature'
    }))

    return {
      features,
      stats: {
        bounds,
        dataSource,
        matchMode,
        total: features.length,
        totalGrb: Number(count[0]?.n ?? 0),
        totalOsm
      },
      type: 'FeatureCollection'
    }
  } catch (error) {
    console.error('Error in buildings/difference endpoint:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
     sendError(
      event,
      createError({
        statusCode: error instanceof OverpassError ? error.statusCode : 500,
        statusMessage:
          error instanceof OverpassError
            ? error.message
            : `Error calculating difference: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      })
    ); return;
  }
})
