import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { OverpassError, type OverpassBuildings } from '~/server/utils/overpass'
import { asHandler, createEvent, stubNitro, type HttpError } from './nitro'

type Row = Record<string, unknown>
type Query = (sql: string, params?: unknown[]) => Promise<Row[]>

const db = vi.hoisted(() => ({
  queryGrb: vi.fn<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>(),
  queryOsm: vi.fn<(sql: string, params?: unknown[]) => Promise<Record<string, unknown>[]>>()
}))
const overpass = vi.hoisted(() => ({ fetchOverpassBuildings: vi.fn() }))

vi.mock('~/server/utils/db', () => db)
vi.mock('~/server/utils/overpass', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/server/utils/overpass')>()),
  fetchOverpassBuildings: overpass.fetchOverpassBuildings
}))

const BOUNDS = [484000, 6594000, 484200, 6594200]
const GEOMETRY = '{"type":"Polygon","coordinates":[[[0,0],[0,1],[1,1],[0,0]]]}'

interface Schema {
  /** grb.building_polygons columns returned by the information_schema check */
  columns?: string[]
  /** grb.buildings_with_addresses exists */
  matview?: boolean
  /** the matview has polygon_id (migration 001) */
  polygonId?: boolean
  /** osm.osm_buildings has the legacy oidn column */
  legacyOidn?: boolean
  /** source:geometry:* tag rows of OSM buildings in the extent */
  osmTagRows?: Row[]
  /** ST_Collect of OSM geometries in the extent (null: no OSM buildings) */
  osmCollection?: string | null
  osmTotal?: string
  /** candidate rows returned by the main query */
  candidates?: Row[]
  sourceCount?: string
}

const MIGRATED: Schema = { columns: ['survey_date', 'type_label', 'entity'], matview: true, polygonId: true }
const LEGACY: Schema = { columns: ['opndatum', 'lbltype'], matview: true, polygonId: false }

/** Fake both databases, answering each query by what it selects. */
function fakeDatabases(schema: Schema) {
  const grb: Query = async (sql) => {
    if (sql.includes('information_schema.columns')) return (schema.columns ?? []).map((c) => ({ column_name: c }))
    if (sql.includes('pg_matviews')) return [{ ok: schema.matview ?? false, has_polygon_id: schema.polygonId ?? false }]
    if (sql.includes('COUNT(*) AS n')) return [{ n: schema.sourceCount ?? '7' }]
    return schema.candidates ?? [{ geometry: GEOMETRY, entity: 'Gbg', oidn: '1', total_osm: '3' }]
  }
  const osm: Query = async (sql) => {
    if (sql.includes('information_schema.columns')) return [{ has_legacy_oidn: schema.legacyOidn ?? false }]
    if (sql.includes("tags->>'source:geometry:ref'")) return schema.osmTagRows ?? []
    return [
      {
        geom_collection: schema.osmCollection === undefined ? 'OSM_GC' : schema.osmCollection,
        total_osm: schema.osmTotal ?? '3'
      }
    ]
  }
  db.queryGrb.mockImplementation(grb)
  db.queryOsm.mockImplementation(osm)
}

/** The candidate query: the last GRB query that is not a schema check or the source count. */
function candidateCall(): { sql: string; params: unknown[] } {
  const calls = db.queryGrb.mock.calls.filter(
    ([sql]) => !sql.includes('information_schema') && !sql.includes('pg_matviews') && !sql.includes('COUNT(*) AS n')
  )
  const last = calls.at(-1)
  if (!last) throw new Error('no candidate query')
  return { sql: last[0], params: last[1] ?? [] }
}

const countCall = (): string => db.queryGrb.mock.calls.find(([sql]) => sql.includes('COUNT(*) AS n'))?.[0] ?? ''

const overpassData = (over: Partial<OverpassBuildings> = {}): OverpassBuildings => ({
  geomCollection: 'LIVE_GC',
  geomCollection3857: 'LIVE_GC_3857',
  totalOsm: 4,
  sourceRefs: ['Gbg/9'],
  features: [],
  ...over
})

const load = async () => asHandler(await import('~/server/api/buildings/difference.post'))
const post = async (body: Record<string, unknown>) => {
  const event = createEvent({ body: { bounds: BOUNDS, ...body } })
  const result = await (await load())(event)
  return { event, result }
}

beforeEach(() => {
  stubNitro()
  db.queryGrb.mockReset()
  db.queryOsm.mockReset()
  overpass.fetchOverpassBuildings.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/buildings/difference — validation', () => {
  it.each([
    [{ bounds: undefined }, 'Invalid bounds'],
    [{ bounds: [1, 2, 3] }, 'Invalid bounds'],
    [{ matchMode: 'fuzzy' }, 'Invalid matchMode'],
    [{ dataSource: 'osm' }, 'Invalid dataSource'],
    [{ geometryThreshold: 'abc' }, 'Invalid geometryThreshold'],
    [{ geometryThreshold: 0.2 }, 'Invalid geometryThreshold'],
    [{ geometryThreshold: 0.96 }, 'Invalid geometryThreshold'],
    [{ dataSource: 'picc', matchMode: 'source' }, 'only available for GRB'],
    [{ dataSource: 'urbis', matchMode: 'both' }, 'only available for GRB']
  ])('answers 400 for %j', async (body, message) => {
    const { event } = await post(body)
    expect(event.sentError?.statusCode).toBe(400)
    expect(event.sentError?.statusMessage).toContain(message)
    expect(db.queryGrb).not.toHaveBeenCalled()
  })
})

describe('POST /api/buildings/difference — GRB source mode', () => {
  it('excludes GRB polygons whose Entity/oidn key is referenced by an OSM building (migrated schema)', async () => {
    fakeDatabases({
      ...MIGRATED,
      osmTagRows: [
        { oidn: null, ref: 'Gbg/1;Gba/2', entity: null },
        { oidn: '0003', ref: null, entity: 'Gba' }
      ]
    })
    const { result } = await post({ matchMode: 'source' })

    const { sql, params } = candidateCall()
    // The stored entity is used for the key, and addresses are joined per polygon
    expect(sql).toContain("(bp.entity || '/' || bp.oidn::text) != ALL($6::text[])")
    expect(sql).toContain('bp.entity AS entity')
    expect(sql).toContain('LEFT JOIN grb.buildings_with_addresses bwa ON bwa.polygon_id = bp.id')
    expect(sql).toContain('bp.survey_date::text AS opndatum')
    expect(sql).toContain('bp.type_label AS lbltype')
    expect(params.slice(0, 4)).toEqual(BOUNDS)
    expect(params[4]).toBe(3)
    expect(params[5]).toEqual(['Gbg/1', 'Gba/2', 'Gba/3'])

    expect(result).toEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: JSON.parse(GEOMETRY), properties: { entity: 'Gbg', oidn: '1' } }],
      stats: { total: 1, totalGrb: 7, totalOsm: 3, dataSource: 'grb', matchMode: 'source', bounds: BOUNDS }
    })
  })

  it('derives the entity from the type label on an unmigrated schema', async () => {
    fakeDatabases({ ...LEGACY, osmTagRows: [] })
    await post({ matchMode: 'source' })

    const { sql, params } = candidateCall()
    expect(sql).not.toContain('bp.entity')
    expect(sql).toContain("CASE WHEN coalesce(lower(bp.lbltype), '') = ''")
    expect(sql).toContain("THEN 'Gbg' ELSE 'Gba' END")
    expect(sql).toContain('bwa.oidn = bp.oidn')
    expect(sql).toContain('bp.opndatum::text AS opndatum')
    // No reference in OSM: a sentinel keeps `!= ALL` from matching an empty array
    expect(params[5]).toEqual(['-1'])
  })

  it('applies the building type allow-list (issue #53) to the candidates and the source count', async () => {
    fakeDatabases(MIGRATED)
    await post({ matchMode: 'source' })
    const filter = "lower(bp.type_label) = ANY(ARRAY['hoofdgebouw', 'bijgebouw', 'verdieping'])"
    expect(candidateCall().sql).toContain(filter)
    expect(countCall()).toContain(filter)
    expect(countCall()).toContain('FROM grb.building_polygons bp')
  })

  it('works without the address matview and without type/date columns', async () => {
    fakeDatabases({ columns: [], matview: false })
    await post({ matchMode: 'source' })
    const { sql } = candidateCall()
    expect(sql).not.toContain('buildings_with_addresses')
    expect(sql).not.toContain('bwa.')
    expect(sql).toContain('NULL::text AS opndatum')
    expect(sql).toContain('NULL::text AS lbltype')
  })

  it('reads the legacy osm_buildings.oidn column when it exists', async () => {
    fakeDatabases({ ...MIGRATED, legacyOidn: true, osmTagRows: [{ oidn: null, ref: null, legacy_oidn: '55' }] })
    await post({ matchMode: 'source' })
    const osmSql = db.queryOsm.mock.calls.find(([sql]) => sql.includes("tags->>'source:geometry:ref'"))?.[0]
    expect(osmSql).toContain('oidn::text AS legacy_oidn')
    expect(osmSql).toContain('OR oidn IS NOT NULL')
    expect(candidateCall().params[5]).toEqual(['Gbg/55'])
  })

  it('takes the references from Overpass in live mode', async () => {
    fakeDatabases(MIGRATED)
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData({ sourceRefs: ['Gba/7', 'Gbg/8'] }))
    const { result } = await post({ matchMode: 'source', useOverpass: true })
    expect(overpass.fetchOverpassBuildings).toHaveBeenCalledWith(BOUNDS)
    expect(db.queryOsm).not.toHaveBeenCalled()
    expect(candidateCall().params[5]).toEqual(['Gba/7', 'Gbg/8'])
    expect(result.stats.totalOsm).toBe(2)
  })
})

describe('POST /api/buildings/difference — GRB geometry and combined modes', () => {
  it('keeps GRB polygons without a matching OSM geometry (geometry mode)', async () => {
    fakeDatabases({ ...MIGRATED, osmTotal: '12' })
    const { result } = await post({ geometryThreshold: 0.8 })
    const { sql, params } = candidateCall()
    expect(sql).toContain('NOT EXISTS')
    expect(sql).not.toContain('!= ALL')
    expect(sql).toContain('g.entity')
    expect(params).toEqual([...BOUNDS, 'OSM_GC', 12, 0.8])
    expect(result.stats).toMatchObject({ totalOsm: 12, matchMode: 'geometry', dataSource: 'grb' })
  })

  it('returns every GRB polygon when there are no OSM buildings in view', async () => {
    fakeDatabases({ ...MIGRATED, osmCollection: null, osmTotal: '0' })
    await post({})
    const { sql, params } = candidateCall()
    expect(sql).not.toContain('osm_geoms')
    expect(sql).toContain('0::bigint AS total_osm')
    expect(params).toEqual(BOUNDS)
  })

  it('combines geometry and source-tag matching (both mode)', async () => {
    fakeDatabases({ ...MIGRATED, osmTagRows: [{ ref: 'Gba/2' }] })
    await post({ matchMode: 'both' })
    const { sql, params } = candidateCall()
    expect(sql).toContain("(g.entity || '/' || g.oidn::text) != ALL($8::text[]) AND NOT EXISTS")
    expect(params).toEqual([...BOUNDS, 'OSM_GC', 3, 0.7, ['Gba/2']])
  })

  it('combines source-tag matching with an empty OSM extent (both mode)', async () => {
    fakeDatabases({ ...LEGACY, osmCollection: null, osmTagRows: [] })
    await post({ matchMode: 'both' })
    const { sql, params } = candidateCall()
    // The label-derived entity is computed once in the CTE, then keyed on in the outer query
    expect(sql).toContain("(CASE WHEN coalesce(lower(bp.lbltype), '') = ''")
    expect(sql).toContain("WHERE (g.entity || '/' || g.oidn::text) != ALL($5::text[])")
    expect(sql).not.toContain('osm_geoms')
    expect(params).toEqual([...BOUNDS, ['-1']])
  })

  it('passes the OSM references when the extent has no OSM geometry (both mode)', async () => {
    fakeDatabases({ ...MIGRATED, osmCollection: null, osmTagRows: [{ ref: 'Gbg/4' }] })
    await post({ matchMode: 'both' })
    expect(candidateCall().params).toEqual([...BOUNDS, ['Gbg/4']])
  })

  it('uses the sentinel reference when OSM has geometries but no GRB tags (both mode)', async () => {
    fakeDatabases({ ...MIGRATED, osmTagRows: [] })
    await post({ matchMode: 'both' })
    expect(candidateCall().params).toEqual([...BOUNDS, 'OSM_GC', 3, 0.7, ['-1']])
  })

  it('counts 0 OSM buildings when the mirror returns no count', async () => {
    fakeDatabases(MIGRATED)
    const osm = db.queryOsm.getMockImplementation()
    db.queryOsm.mockImplementation(async (sql, params) =>
      sql.includes('ST_Collect') ? [{ geom_collection: null }] : (osm?.(sql, params) ?? [])
    )
    const { result } = await post({})
    expect(result.stats.totalOsm).toBe(0)
  })

  it('uses the Overpass geometries (EPSG:4326) in live mode', async () => {
    fakeDatabases(MIGRATED)
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData())
    await post({ useOverpass: true })
    expect(db.queryOsm).not.toHaveBeenCalled()
    expect(candidateCall().params).toEqual([...BOUNDS, 'LIVE_GC', 4, 0.7])
  })

  it('treats an empty Overpass answer as no OSM buildings', async () => {
    fakeDatabases(MIGRATED)
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData({ geomCollection: null, totalOsm: 0 }))
    await post({ useOverpass: true })
    expect(candidateCall().params).toEqual(BOUNDS)
  })
})

describe('POST /api/buildings/difference — KNW, Urbis and PICC', () => {
  it('compares KNW kunstwerken without GRB schema checks', async () => {
    fakeDatabases({ candidates: [] })
    const { result } = await post({ dataSource: 'knw' })
    expect(db.queryGrb.mock.calls.some(([sql]) => sql.includes('information_schema'))).toBe(false)
    const { sql, params } = candidateCall()
    expect(sql).toContain('FROM knw_in_extent k')
    expect(params).toEqual([...BOUNDS, 'OSM_GC', 3, 0.7])
    expect(countCall()).toContain('FROM grb.kunstwerken k')
    // The source count is independent of the candidates (issue: stats when everything is mapped)
    expect(result.stats).toMatchObject({ total: 0, totalGrb: 7 })
  })

  it('returns every KNW structure when there is no OSM data in view', async () => {
    fakeDatabases({ osmCollection: null, osmTotal: undefined })
    db.queryOsm.mockResolvedValue([{}])
    const { result } = await post({ dataSource: 'knw' })
    expect(candidateCall().sql).toContain('FROM grb.kunstwerken k')
    expect(candidateCall().params).toEqual(BOUNDS)
    expect(result.stats.totalOsm).toBe(0)
  })

  it('uses the WGS84 Overpass collection for KNW', async () => {
    fakeDatabases({})
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData())
    await post({ dataSource: 'knw', useOverpass: true })
    expect(candidateCall().params).toEqual([...BOUNDS, 'LIVE_GC', 4, 0.7])
  })

  it.each([
    ['urbis', 'urbis.buildings_with_addresses', 'FROM urbis_in_extent u'],
    ['picc', 'picc.buildings_with_addresses', 'FROM picc_in_extent p']
  ])('compares %s buildings in EPSG:3857', async (dataSource, table, cte) => {
    fakeDatabases({})
    await post({ dataSource })
    const { sql, params } = candidateCall()
    expect(sql).toContain(cte)
    expect(sql).toContain('ST_SetSRID(ST_GeomFromGeoJSON($5), 3857)')
    expect(params).toEqual([...BOUNDS, 'OSM_GC', 3, 0.7])
    expect(countCall()).toContain(table)
    const osmSql = db.queryOsm.mock.calls[0]?.[0] ?? ''
    expect(osmSql).toContain('ST_Collect(geom_mercator)')
  })

  it.each(['urbis', 'picc'])('returns every %s building when there is no OSM data in view', async (dataSource) => {
    fakeDatabases({ osmCollection: null })
    db.queryOsm.mockResolvedValue([{}])
    const { result } = await post({ dataSource })
    expect(candidateCall().sql).not.toContain('osm_geoms')
    expect(candidateCall().params).toEqual(BOUNDS)
    expect(result.stats.totalOsm).toBe(0)
  })

  it.each(['urbis', 'picc'])('uses the Web Mercator Overpass collection for %s', async (dataSource) => {
    fakeDatabases({})
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData())
    await post({ dataSource, useOverpass: true })
    expect(db.queryOsm).not.toHaveBeenCalled()
    expect(candidateCall().params).toEqual([...BOUNDS, 'LIVE_GC_3857', 4, 0.7])
  })

  it('defaults the source count to 0 when the count query returns no row', async () => {
    fakeDatabases({})
    const grb = db.queryGrb.getMockImplementation()
    db.queryGrb.mockImplementation(async (sql, params) =>
      sql.includes('COUNT(*) AS n') ? [] : (grb?.(sql, params) ?? [])
    )
    const { result } = await post({ dataSource: 'picc' })
    expect(result.stats.totalGrb).toBe(0)
  })
})

describe('POST /api/buildings/difference — errors', () => {
  it('answers with the Overpass error status (e.g. 400 for a too large view)', async () => {
    fakeDatabases(MIGRATED)
    overpass.fetchOverpassBuildings.mockRejectedValue(new OverpassError('Zoom in.', 400))
    const { event } = await post({ useOverpass: true })
    expect(event.sentError).toMatchObject({ statusCode: 400, statusMessage: 'Zoom in.' } satisfies Partial<HttpError>)
  })

  it('answers 500 with the database error message', async () => {
    db.queryGrb.mockRejectedValue(new Error('connection refused'))
    const { event } = await post({})
    expect(event.sentError?.statusCode).toBe(500)
    expect(event.sentError?.statusMessage).toBe('Error calculating difference: connection refused')
  })

  it('serialises non-Error failures', async () => {
    db.queryGrb.mockRejectedValue({ code: 'XX' })
    const { event } = await post({})
    expect(event.sentError?.statusMessage).toBe('Error calculating difference: {"code":"XX"}')
  })
})
