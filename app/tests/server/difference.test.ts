import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { type OverpassBuildings, OverpassError } from '~/server/utils/overpass'
import { CANDIDATES_CONTRACT } from '~/utils/candidates'
import { asHandler, createEvent, stubNitro } from './nitro'

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

interface Data {
  /** Source:geometry:* tag rows of OSM buildings in the extent */
  osmTagRows?: Row[]
  /** ST_Collect of OSM geometries in the extent (null: no OSM buildings) */
  osmCollection?: string | null
  osmTotal?: string | null
  /** Candidate rows returned by the main query */
  candidates?: Row[]
  /** Rows of the source count query */
  count?: Row[]
}

/** Fake both databases, answering each query by what it selects. */
function fakeDatabases(data: Data = {}) {
  const grb: Query = async (sql) => {
    if (sql.includes('COUNT(*) AS n')) return data.count ?? [{ n: '7' }]
    return data.candidates ?? [{ fid: '1', geometry: GEOMETRY, source: 'grb', source_ref: 'Gbg/1' }]
  }
  const osm: Query = async (sql) => {
    if (sql.includes("tags->>'source:geometry:ref'")) return data.osmTagRows ?? []
    return [
      {
        geom_collection: data.osmCollection === undefined ? 'OSM_GC' : data.osmCollection,
        total_osm: data.osmTotal === undefined ? '3' : data.osmTotal
      }
    ]
  }
  db.queryGrb.mockImplementation(grb)
  db.queryOsm.mockImplementation(osm)
}

const candidateCall = (): { sql: string; params: unknown[] } => {
  const call = db.queryGrb.mock.calls.find(([sql]) => !sql.includes('COUNT(*) AS n'))
  if (!call) throw new Error('no candidate query')
  return { params: call[1] ?? [], sql: call[0] }
}
const countCall = (): { sql: string; params: unknown[] } => {
  const call = db.queryGrb.mock.calls.find(([sql]) => sql.includes('COUNT(*) AS n'))
  if (!call) throw new Error('no count query')
  return { params: call[1] ?? [], sql: call[0] }
}

const overpassData = (over: Partial<OverpassBuildings> = {}): OverpassBuildings => ({
  features: [],
  geomCollection: 'LIVE_GC',
  geomCollection3857: 'LIVE_GC_3857',
  sourceRefs: ['Gbg/9'],
  totalOsm: 4,
  ...over
})

const load = async () => asHandler(await import('~/server/api/buildings/difference.post'))
const post = async (body: Record<string, unknown>) => {
  const event = createEvent({ body: { bounds: BOUNDS, contract: CANDIDATES_CONTRACT, ...body } })
  const result = (await (
    await load()
  )(event)) as {
    features: { type: string; geometry: unknown; properties: Row }[]
    stats: Row
  }
  return { event, result }
}

beforeEach(() => {
  stubNitro()
  db.queryGrb.mockReset()
  db.queryOsm.mockReset()
  overpass.fetchOverpassBuildings.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/buildings/difference: validation', () => {
  it.each([
    [{ bounds: undefined }, 'Invalid bounds'],
    [{ bounds: [1, 2, 3] }, 'Invalid bounds'],
    [{ bounds: [1, 2, 3, 'x'] }, 'Invalid bounds'],
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

  it.each([undefined, 0, 2])('asks a page that does not send contract %s to reload (409)', async (contract) => {
    const { event } = await post({ contract })
    expect(event.sentError?.statusCode).toBe(409)
    expect(event.sentError?.statusMessage).toContain('reload the page')
    expect(db.queryGrb).not.toHaveBeenCalled()
  })
})

describe('POST /api/buildings/difference: one query for every source', () => {
  it.each([
    ['grb', 'grb.candidates'],
    ['knw', 'grb.knw_candidates'],
    ['picc', 'picc.candidates'],
    ['urbis', 'urbis.candidates']
  ])('reads %s from %s, its count too', async (dataSource, view) => {
    fakeDatabases()
    await post({ dataSource })
    expect(candidateCall().sql).toContain(`FROM ${view} c`)
    expect(countCall().sql).toContain(`FROM ${view} c`)
  })

  it('returns the contract properties of every candidate, geometry apart', async () => {
    fakeDatabases({
      candidates: [{ details: { georef_id: 'G' }, fid: '11', geometry: GEOMETRY, source: 'picc', source_id: '11' }]
    })
    const { result } = await post({ dataSource: 'picc' })
    expect(result.features).toEqual([
      {
        geometry: JSON.parse(GEOMETRY),
        properties: { details: { georef_id: 'G' }, fid: '11', source: 'picc', source_id: '11' },
        type: 'Feature'
      }
    ])
    expect(candidateCall().sql).toMatch(
      /SELECT ST_AsGeoJSON\(ST_Transform\(c\.geom, 4326\)\) AS geometry, c\.fid, c\.source,/
    )
  })

  it('reports the candidates, the source objects and the OSM buildings in view', async () => {
    fakeDatabases({ count: [{ n: '12' }], osmTotal: '5' })
    const { result } = await post({ dataSource: 'grb' })
    expect(result.stats).toEqual({
      bounds: BOUNDS,
      dataSource: 'grb',
      matchMode: 'geometry',
      total: 1,
      totalGrb: 12,
      totalOsm: 5
    })
  })

  it('counts 0 when the count or the OSM query return nothing', async () => {
    fakeDatabases({ count: [], osmCollection: null, osmTotal: null })
    const { result } = await post({ dataSource: 'urbis' })
    expect(result.stats).toMatchObject({ totalGrb: 0, totalOsm: 0 })
  })

  it('applies the GRB building type allow-list (issue #53) to the candidates and the count, for GRB only', async () => {
    fakeDatabases()
    await post({ dataSource: 'grb' })
    expect(candidateCall().sql).toContain('lower(c.type_label) = ANY(')
    expect(candidateCall().params).toContainEqual(['hoofdgebouw', 'bijgebouw', 'verdieping', 'afdak'])
    expect(countCall().sql).toContain('lower(c.type_label) = ANY(')
    expect(countCall().params).toEqual([...BOUNDS, ['hoofdgebouw', 'bijgebouw', 'verdieping', 'afdak']])

    db.queryGrb.mockClear()
    await post({ dataSource: 'picc' })
    expect(candidateCall().sql).not.toContain('lower(c.type_label)')
    expect(countCall().params).toEqual(BOUNDS)
  })
})

describe('POST /api/buildings/difference: geometry matching', () => {
  it('uses the default geometry threshold when omitted', async () => {
    fakeDatabases()
    await post({ dataSource: 'knw' })
    expect(candidateCall().params).toEqual([...BOUNDS, 'OSM_GC', 0.85])
  })

  it('drops candidates covered by an OSM outline both ways, at the threshold, in EPSG:3857', async () => {
    fakeDatabases()
    await post({ dataSource: 'knw', geometryThreshold: 0.8 })
    const { sql, params } = candidateCall()
    expect(sql).toContain('ST_SetSRID(ST_GeomFromGeoJSON($5), 3857)')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain('/ NULLIF(ST_Area(c.geom), 0) >= $6')
    expect(sql).toContain('/ NULLIF(ST_Area(o.geom), 0) >= $6')
    expect(params).toEqual([...BOUNDS, 'OSM_GC', 0.8])
    expect(db.queryOsm.mock.calls[0]?.[0]).toContain('COALESCE(geom_mercator, ST_Transform(geom, 3857))')
  })

  it('returns every candidate when there are no OSM buildings in view', async () => {
    fakeDatabases({ osmCollection: null })
    await post({ dataSource: 'urbis' })
    expect(candidateCall().sql).not.toContain('NOT EXISTS')
    expect(candidateCall().params).toEqual(BOUNDS)
  })

  it('uses the Web Mercator Overpass collection in live mode', async () => {
    fakeDatabases()
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData())
    const { result } = await post({ dataSource: 'picc', useOverpass: true })
    expect(db.queryOsm).not.toHaveBeenCalled()
    expect(candidateCall().params).toContain('LIVE_GC_3857')
    expect(result.stats.totalOsm).toBe(4)
  })

  it('treats an empty Overpass answer as no OSM buildings', async () => {
    fakeDatabases()
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData({ geomCollection3857: null, totalOsm: 0 }))
    await post({ dataSource: 'grb', useOverpass: true })
    expect(candidateCall().sql).not.toContain('NOT EXISTS')
  })
})

describe('POST /api/buildings/difference: GRB source references', () => {
  it('drops candidates whose Entity/oidn reference is on an OSM building in view (source mode)', async () => {
    fakeDatabases({
      osmTagRows: [
        { entity: null, oidn: null, ref: 'Gbg/1;Gba/2' },
        { entity: 'Gba', oidn: '0003', ref: null }
      ]
    })
    const { result } = await post({ dataSource: 'grb', matchMode: 'source' })
    const { sql, params } = candidateCall()
    expect(sql).toContain('coalesce(c.source_ref <> ALL($6::text[]), TRUE)')
    expect(sql).not.toContain('NOT EXISTS')
    expect(params[5]).toEqual(['Gbg/1', 'Gba/2', 'Gba/3'])
    // Source mode counts the referenced objects as OSM buildings, and needs no OSM geometries
    expect(result.stats.totalOsm).toBe(3)
    expect(db.queryOsm).toHaveBeenCalledTimes(1)
  })

  it('keeps every candidate when no OSM building in view has a reference', async () => {
    fakeDatabases()
    await post({ dataSource: 'grb', matchMode: 'source' })
    expect(candidateCall().params[5]).toEqual([])
  })

  it('requires both an unmatched geometry and an unreferenced object (both mode)', async () => {
    fakeDatabases({ osmTagRows: [{ entity: null, oidn: null, ref: 'Gbg/1' }] })
    const { result } = await post({ dataSource: 'grb', geometryThreshold: 0.5, matchMode: 'both' })
    const { sql, params } = candidateCall()
    expect(sql).toContain('c.source_ref <> ALL($6::text[])')
    expect(sql).toContain('ST_GeomFromGeoJSON($7)')
    expect(params.slice(5)).toEqual([['Gbg/1'], 'OSM_GC', 0.5])
    expect(result.stats.totalOsm).toBe(3)
  })

  it('takes the references from Overpass in live mode', async () => {
    fakeDatabases()
    overpass.fetchOverpassBuildings.mockResolvedValue(overpassData())
    await post({ dataSource: 'grb', matchMode: 'source', useOverpass: true })
    expect(db.queryOsm).not.toHaveBeenCalled()
    expect(candidateCall().params[5]).toEqual(['Gbg/9'])
  })
})

describe('POST /api/buildings/difference: errors', () => {
  it('answers with the Overpass error status (e.g. 400 for a too large view)', async () => {
    overpass.fetchOverpassBuildings.mockRejectedValue(new OverpassError('View too large', 400))
    const { event } = await post({ useOverpass: true })
    expect(event.sentError).toMatchObject({ statusCode: 400, statusMessage: 'View too large' })
  })

  it('answers 500 with the database error message', async () => {
    db.queryOsm.mockRejectedValue(new Error('connection refused'))
    const { event } = await post({})
    expect(event.sentError?.statusCode).toBe(500)
    expect(event.sentError?.statusMessage).toContain('connection refused')
  })

  it('serialises non-Error failures', async () => {
    db.queryOsm.mockRejectedValue({ code: 'XX' })
    const { event } = await post({})
    expect(event.sentError?.statusMessage).toContain('{"code":"XX"}')
  })
})
