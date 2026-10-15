import { queryGrb, queryOsm } from '~/server/utils/db'
import { BUILDING_TYPE_LABELS } from '~/utils/grbExportTags'
import { fetchOverpassBuildings, type OverpassBuildings } from '~/server/utils/overpass'

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody(event)
    const { bounds, matchMode = 'geometry', dataSource = 'grb', geometryThreshold = 0.7, useOverpass = false } = body

    if (!bounds || bounds.length !== 4) {
      return sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]'
        })
      )
    }

    if (matchMode !== 'geometry' && matchMode !== 'source' && matchMode !== 'both') {
      return sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid matchMode. Expected "geometry", "source", or "both"'
        })
      )
    }

    if (dataSource !== 'grb' && dataSource !== 'knw' && dataSource !== 'picc' && dataSource !== 'urbis') {
      return sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid dataSource. Expected "grb", "knw", "picc", or "urbis"'
        })
      )
    }

    const numericThreshold = Number(geometryThreshold)
    if (Number.isNaN(numericThreshold) || numericThreshold < 0.3 || numericThreshold > 0.95) {
      return sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Invalid geometryThreshold. Expected a number between 0.3 and 0.95'
        })
      )
    }

    // Source tag matching (and combined mode) only work for GRB
    // (PICC/Urbis have no source:geometry:oidn tags in OSM)
    if ((matchMode === 'source' || matchMode === 'both') && dataSource !== 'grb') {
      return sendError(
        event,
        createError({
          statusCode: 400,
          statusMessage: 'Source tag matching is only available for GRB data. Use geometry mode for KNW/PICC/Urbis.'
        })
      )
    }

    const [minX, minY, maxX, maxY] = bounds

    let rows: any[]
    let totalOsm = 0

    // GRB schema compatibility (legacy vs normalized column names)
    const needsGrbPolygonColumns = dataSource === 'grb'
    let grbSurveyDateExpr = 'NULL::date'
    let grbTypeLabelExpr = 'NULL::text'

    if (needsGrbPolygonColumns) {
      const grbColumns = await queryGrb(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'grb'
          AND table_name = 'building_polygons'
          AND column_name IN ('survey_date', 'opndatum', 'type_label', 'lbltype');
      `)

      const columnNames = new Set(grbColumns.map((row: any) => row.column_name))

      if (columnNames.has('survey_date')) {
        grbSurveyDateExpr = 'bp.survey_date'
      } else if (columnNames.has('opndatum')) {
        grbSurveyDateExpr = 'bp.opndatum'
      }

      if (columnNames.has('type_label')) {
        grbTypeLabelExpr = 'bp.type_label'
      } else if (columnNames.has('lbltype')) {
        grbTypeLabelExpr = 'bp.lbltype'
      }
    }

    // Issue #53: GRB building pre-filtering. GBG and GBA polygons share grb.building_polygons and are
    // distinguished by type_label (LBLTYPE). Only gbg-1/gbg-2 (hoofdgebouw, bijgebouw) and gba-1 (verdieping,
    // exported with a fixme) are building candidates; gbg-3 (virtual facade) and all other GBA types are
    // excluded. Rows without a type_label (or without the column) are kept.
    const grbBuildingTypeFilter = `(coalesce(lower(${grbTypeLabelExpr}), '') = '' OR lower(${grbTypeLabelExpr}) = ANY(ARRAY[${BUILDING_TYPE_LABELS.map((l) => `'${l}'`).join(', ')}]))`

    // Issue #49: include address data in GRB exports. Addresses live in the grb.buildings_with_addresses
    // matview (keyed on oidn). Guard on its existence so deployments without the matview still work.
    let hasGrbAddresses = false
    if (needsGrbPolygonColumns) {
      const mv = await queryGrb(`
        SELECT EXISTS (
          SELECT 1 FROM pg_matviews
          WHERE schemaname = 'grb' AND matviewname = 'buildings_with_addresses'
        ) AS ok;
      `)
      hasGrbAddresses = Boolean(mv[0]?.ok)
    }
    const grbAddressColsCsv = hasGrbAddresses
      ? 'bwa.addresses, bwa.street_names, bwa.postcodes, bwa.municipalities, bwa.address_count'
      : ''
    const grbAddressSelect = grbAddressColsCsv ? `${grbAddressColsCsv},` : ''
    const grbAddressJoin = hasGrbAddresses ? 'LEFT JOIN grb.buildings_with_addresses bwa ON bwa.oidn = bp.oidn' : ''
    // For the CTE pass-through (geometry-with-osm branch): columns selected in CTE, re-selected from alias g
    const grbAddressCteSelect = hasGrbAddresses
      ? 'bwa.addresses, bwa.street_names, bwa.postcodes, bwa.municipalities, bwa.address_count,'
      : ''
    const grbAddressOuterSelect = hasGrbAddresses
      ? 'g.addresses, g.street_names, g.postcodes, g.municipalities, g.address_count,'
      : ''

    // Issue #9: optionally source OSM buildings live from Overpass for the current bbox
    // (opt-in; GRB only in this v1). Falls back to the Postgres mirror when not set.
    const overpassData: OverpassBuildings | null =
      useOverpass && dataSource === 'grb' ? await fetchOverpassBuildings([minX, minY, maxX, maxY]) : null

    // Collect OSM source:geometry:oidn references in the extent (GRB only).
    // Shared by 'source' mode and 'both' mode (issue #6: combine geometry + source-tag filtering).
    const fetchOsmSourceOidns = async (): Promise<string[]> => {
      // When sourcing live from Overpass, the oidn list comes from the Overpass tags instead.
      if (overpassData) return overpassData.oidnList

      const columnCheck = await queryOsm(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'osm'
            AND table_name = 'osm_buildings'
            AND column_name = 'oidn'
        ) AS has_legacy_oidn;
      `)
      const hasLegacyOidn = Boolean(columnCheck[0]?.has_legacy_oidn)

      const osmQuery = hasLegacyOidn
        ? `
        SELECT DISTINCT
          COALESCE(
            NULLIF(trim(tags->>'source:geometry:oidn'), ''),
            NULLIF(trim(split_part(tags->>'source:geometry:ref', '/', 2)), ''),
            NULLIF(oidn::text, '')
          ) AS oidn
        FROM osm.osm_buildings
        WHERE COALESCE(geom_mercator, ST_Transform(geom, 3857)) && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(COALESCE(geom_mercator, ST_Transform(geom, 3857)), ST_MakeEnvelope($1, $2, $3, $4, 3857))
          AND (
            tags ? 'source:geometry:oidn'
            OR tags ? 'source:geometry:ref'
            OR oidn IS NOT NULL
          )
      `
        : `
        SELECT DISTINCT
          COALESCE(
            NULLIF(trim(tags->>'source:geometry:oidn'), ''),
            NULLIF(trim(split_part(tags->>'source:geometry:ref', '/', 2)), '')
          ) AS oidn
        FROM osm.osm_buildings
        WHERE COALESCE(geom_mercator, ST_Transform(geom, 3857)) && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(COALESCE(geom_mercator, ST_Transform(geom, 3857)), ST_MakeEnvelope($1, $2, $3, $4, 3857))
          AND (
            tags ? 'source:geometry:oidn'
            OR tags ? 'source:geometry:ref'
          )
      `

      const osmRows = await queryOsm(osmQuery, [minX, minY, maxX, maxY])
      return osmRows.map((row: any) => row.oidn).filter(Boolean)
    }

    // Pre-fetch the source-tag oidn list for the 'both' combined mode (source mode fetches inline below).
    const bothOidnList: string[] = matchMode === 'both' ? await fetchOsmSourceOidns() : []

    if (matchMode === 'source') {
      // Source tag matching (GRB only): Show GRB buildings that DON'T have matching OSM source:geometry:oidn
      // Support multiple OSM reference patterns for compatibility:
      // 1) tags.source:geometry:oidn
      // 2) tags.source:geometry:ref (format Entity/OIDN)
      // 3) optional legacy/imported osm.osm_buildings.oidn column (when present)

      // Step 1: Get OSM buildings with source:geometry:oidn in the extent
      const oidnList = await fetchOsmSourceOidns()
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
          ${grbSurveyDateExpr} AS opndatum,
          ${grbTypeLabelExpr} AS lbltype,
          ${grbAddressSelect}
          COUNT(*) OVER() AS total_grb,
          $5::bigint AS total_osm
        FROM grb.building_polygons bp ${grbAddressJoin}, envelope_4326 e
        WHERE bp.geom && e.env
          AND ST_Intersects(bp.geom, e.env)
          AND bp.oidn::text != ALL($6::text[])
          AND ${grbBuildingTypeFilter}
        ORDER BY bp.oidn;
      `

      rows = await queryGrb(grbQuery, [minX, minY, maxX, maxY, totalOsm, oidnList.length > 0 ? oidnList : ['-1']])
    } else if (dataSource === 'grb') {
      // Geometry matching for GRB: GRB polygons with no corresponding OSM building
      // A match = overlap threshold reached in both directions (source and OSM)
      //
      // Two-step approach to avoid FDW overhead:
      // 1. Fetch OSM geometries directly from osmbe (uses local GIST index), OR live from Overpass (#9)
      // 2. Pass collected geometry to GRB comparison query (all local operations)
      let osmGeomCollection: string | null
      if (overpassData) {
        // Both Overpass geometries and the GRB query operate in EPSG:4326
        osmGeomCollection = overpassData.geomCollection
        totalOsm = overpassData.totalOsm
      } else {
        const osmResult = await queryOsm(
          `
          SELECT
            ST_AsGeoJSON(ST_Collect(COALESCE(geom, ST_Transform(geom_mercator, 4326)))) AS geom_collection,
            COUNT(*) AS total_osm
          FROM osm.osm_buildings
          WHERE COALESCE(geom, ST_Transform(geom_mercator, 4326)) && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(COALESCE(geom, ST_Transform(geom_mercator, 4326)), ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
        `,
          [minX, minY, maxX, maxY]
        )

        osmGeomCollection = osmResult[0]?.geom_collection ?? null
        totalOsm = parseInt(osmResult[0]?.total_osm || '0')
      }

      if (!osmGeomCollection) {
        // No OSM buildings in extent — all GRB buildings are candidates
        rows = await queryGrb(
          `
          SELECT
            ST_AsGeoJSON(bp.geom) AS geometry,
            bp.oidn,
            bp.gebouw_id,
            ${grbSurveyDateExpr} AS opndatum,
            ${grbTypeLabelExpr} AS lbltype,
            ${grbAddressSelect}
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM grb.building_polygons bp ${grbAddressJoin}
          WHERE bp.geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(bp.geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
            AND ${grbBuildingTypeFilter}
            ${matchMode === 'both' ? 'AND bp.oidn::text != ALL($5::text[])' : ''}
          ORDER BY bp.oidn
        `,
          matchMode === 'both'
            ? [minX, minY, maxX, maxY, bothOidnList.length > 0 ? bothOidnList : ['-1']]
            : [minX, minY, maxX, maxY]
        )
      } else {
        rows = await queryGrb(
          `
          WITH
            envelope_4326 AS (
              SELECT ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326) AS env
            ),
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))).geom AS geom
            ),
            grb_in_extent AS (
              SELECT
                bp.geom,
                bp.oidn,
                bp.gebouw_id,
                ${grbAddressCteSelect}
                ${grbSurveyDateExpr} AS opndatum,
                ${grbTypeLabelExpr} AS lbltype
              FROM grb.building_polygons bp ${grbAddressJoin}, envelope_4326 e
              WHERE bp.geom && e.env
                AND ST_Intersects(bp.geom, e.env)
                AND ${grbBuildingTypeFilter}
                ${matchMode === 'both' ? 'AND bp.oidn::text != ALL($8::text[])' : ''}
            )
          SELECT
            ST_AsGeoJSON(g.geom) AS geometry,
            g.oidn,
            g.gebouw_id,
            ${grbAddressOuterSelect}
            g.opndatum,
            g.lbltype,
            (SELECT COUNT(*) FROM grb_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM grb_in_extent g
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE g.geom && o.geom
              AND ST_Intersects(g.geom, o.geom)
              AND ST_Area(ST_Intersection(g.geom, o.geom))
                  / NULLIF(ST_Area(g.geom), 0) >= $7
              AND ST_Area(ST_Intersection(g.geom, o.geom))
                  / NULLIF(ST_Area(o.geom), 0) >= $7
          )
          ORDER BY g.oidn
        `,
          matchMode === 'both'
            ? [
                minX,
                minY,
                maxX,
                maxY,
                osmGeomCollection,
                totalOsm,
                numericThreshold,
                bothOidnList.length > 0 ? bothOidnList : ['-1']
              ]
            : [minX, minY, maxX, maxY, osmGeomCollection, totalOsm, numericThreshold]
        )
      }
    } else if (dataSource === 'knw') {
      // Geometry matching for KNW: GRB kunstwerken with no corresponding OSM geometry
      const osmResult = await queryOsm(
        `
        SELECT
          ST_AsGeoJSON(ST_Collect(COALESCE(geom, ST_Transform(geom_mercator, 4326)))) AS geom_collection,
          COUNT(*) AS total_osm
        FROM osm.osm_buildings
        WHERE COALESCE(geom, ST_Transform(geom_mercator, 4326)) && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
          AND ST_Intersects(COALESCE(geom, ST_Transform(geom_mercator, 4326)), ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
      `,
        [minX, minY, maxX, maxY]
      )

      const osmGeomCollection = osmResult[0]?.geom_collection
      totalOsm = parseInt(osmResult[0]?.total_osm || '0')

      if (!osmGeomCollection) {
        rows = await queryGrb(
          `
          SELECT
            ST_AsGeoJSON(k.geom) AS geometry,
            k.oidn,
            k.type_code,
            k.type_label,
            k.survey_date,
            k.entity,
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM grb.kunstwerken k
          WHERE k.geom && ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326)
            AND ST_Intersects(k.geom, ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326))
          ORDER BY k.oidn
        `,
          [minX, minY, maxX, maxY]
        )
      } else {
        rows = await queryGrb(
          `
          WITH
            envelope_4326 AS (
              SELECT ST_Transform(ST_MakeEnvelope($1, $2, $3, $4, 3857), 4326) AS env
            ),
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 4326))).geom AS geom
            ),
            knw_in_extent AS (
              SELECT k.geom, k.oidn, k.type_code, k.type_label, k.survey_date, k.entity
              FROM grb.kunstwerken k, envelope_4326 e
              WHERE k.geom && e.env
                AND ST_Intersects(k.geom, e.env)
            )
          SELECT
            ST_AsGeoJSON(k.geom) AS geometry,
            k.oidn,
            k.type_code,
            k.type_label,
            k.survey_date,
            k.entity,
            (SELECT COUNT(*) FROM knw_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM knw_in_extent k
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE k.geom && o.geom
              AND ST_Intersects(k.geom, o.geom)
              AND ST_Area(ST_Intersection(k.geom, o.geom))
                  / NULLIF(ST_Area(k.geom), 0) >= $7
              AND ST_Area(ST_Intersection(k.geom, o.geom))
                  / NULLIF(ST_Area(o.geom), 0) >= $7
          )
          ORDER BY k.oidn
        `,
          [minX, minY, maxX, maxY, osmGeomCollection, totalOsm, numericThreshold]
        )
      }
    } else if (dataSource === 'urbis') {
      // Geometry matching for Urbis: uses urbis.buildings_with_addresses matview (EPSG:3857)
      // Two-step approach: fetch OSM geometries directly from osmbe to avoid FDW overhead
      const osmResult = await queryOsm(
        `
        SELECT
          ST_AsGeoJSON(ST_Collect(geom_mercator)) AS geom_collection,
          COUNT(*) AS total_osm
        FROM osm.osm_buildings
        WHERE geom_mercator && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(geom_mercator, ST_MakeEnvelope($1, $2, $3, $4, 3857))
      `,
        [minX, minY, maxX, maxY]
      )

      const osmGeomCollection = osmResult[0]?.geom_collection
      totalOsm = parseInt(osmResult[0]?.total_osm || '0')

      if (!osmGeomCollection) {
        rows = await queryGrb(
          `
          SELECT
            ST_AsGeoJSON(ST_Transform(b.geom, 4326)) AS geometry,
            b.building_id,
            b.inspire_id,
            b.addresses,
            b.street_names,
            b.postcodes,
            b.municipalities,
            b.address_count,
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM urbis.buildings_with_addresses b
          WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
            AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
          ORDER BY b.building_id
        `,
          [minX, minY, maxX, maxY]
        )
      } else {
        rows = await queryGrb(
          `
          WITH
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 3857))).geom AS geom
            ),
            urbis_in_extent AS (
              SELECT b.geom, b.building_id, b.inspire_id,
                     b.addresses, b.street_names, b.postcodes, b.municipalities, b.address_count
              FROM urbis.buildings_with_addresses b
              WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
                AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
            )
          SELECT
            ST_AsGeoJSON(ST_Transform(u.geom, 4326)) AS geometry,
            u.building_id,
            u.inspire_id,
            u.addresses,
            u.street_names,
            u.postcodes,
            u.municipalities,
            u.address_count,
            (SELECT COUNT(*) FROM urbis_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM urbis_in_extent u
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE u.geom && o.geom
              AND ST_Intersects(u.geom, o.geom)
              AND ST_Area(ST_Intersection(u.geom, o.geom))
                  / NULLIF(ST_Area(u.geom), 0) >= $7
              AND ST_Area(ST_Intersection(u.geom, o.geom))
                  / NULLIF(ST_Area(o.geom), 0) >= $7
          )
          ORDER BY u.building_id
        `,
          [minX, minY, maxX, maxY, osmGeomCollection, totalOsm, numericThreshold]
        )
      }
    } else {
      // Geometry matching for PICC: uses picc.buildings_with_addresses matview (EPSG:3857)
      // Two-step approach: fetch OSM geometries directly from osmbe to avoid FDW overhead
      const osmResult = await queryOsm(
        `
        SELECT
          ST_AsGeoJSON(ST_Collect(geom_mercator)) AS geom_collection,
          COUNT(*) AS total_osm
        FROM osm.osm_buildings
        WHERE geom_mercator && ST_MakeEnvelope($1, $2, $3, $4, 3857)
          AND ST_Intersects(geom_mercator, ST_MakeEnvelope($1, $2, $3, $4, 3857))
      `,
        [minX, minY, maxX, maxY]
      )

      const osmGeomCollection = osmResult[0]?.geom_collection
      totalOsm = parseInt(osmResult[0]?.total_osm || '0')

      if (!osmGeomCollection) {
        rows = await queryGrb(
          `
          SELECT
            ST_AsGeoJSON(ST_Transform(b.geom, 4326)) AS geometry,
            b.objectid,
            b.natur_code,
            b.addresses,
            b.street_names,
            b.postcodes,
            b.municipalities,
            b.address_count,
            COUNT(*) OVER() AS total_grb,
            0::bigint AS total_osm
          FROM picc.buildings_with_addresses b
          WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
            AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
          ORDER BY b.objectid
        `,
          [minX, minY, maxX, maxY]
        )
      } else {
        rows = await queryGrb(
          `
          WITH
            osm_geoms AS (
              SELECT (ST_Dump(ST_SetSRID(ST_GeomFromGeoJSON($5), 3857))).geom AS geom
            ),
            picc_in_extent AS (
              SELECT b.geom, b.objectid, b.natur_code,
                     b.addresses, b.street_names, b.postcodes, b.municipalities, b.address_count
              FROM picc.buildings_with_addresses b
              WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 3857)
                AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 3857))
            )
          SELECT
            ST_AsGeoJSON(ST_Transform(p.geom, 4326)) AS geometry,
            p.objectid,
            p.natur_code,
            p.addresses,
            p.street_names,
            p.postcodes,
            p.municipalities,
            p.address_count,
            (SELECT COUNT(*) FROM picc_in_extent)::bigint AS total_grb,
            $6::bigint AS total_osm
          FROM picc_in_extent p
          WHERE NOT EXISTS (
            SELECT 1 FROM osm_geoms o
            WHERE p.geom && o.geom
              AND ST_Intersects(p.geom, o.geom)
              AND ST_Area(ST_Intersection(p.geom, o.geom))
                  / NULLIF(ST_Area(p.geom), 0) >= $7
              AND ST_Area(ST_Intersection(p.geom, o.geom))
                  / NULLIF(ST_Area(o.geom), 0) >= $7
          )
          ORDER BY p.objectid
        `,
          [minX, minY, maxX, maxY, osmGeomCollection, totalOsm, numericThreshold]
        )
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
        matchMode,
        bounds
      }
    }
  } catch (error) {
    console.error('Error in buildings/difference endpoint:', error)
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    return sendError(
      event,
      createError({
        statusCode: 500,
        statusMessage: `Error calculating difference: ${error instanceof Error ? error.message : JSON.stringify(error)}`
      })
    )
  }
})
