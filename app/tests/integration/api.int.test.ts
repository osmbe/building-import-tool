// API integration tests against a real PostGIS loaded with the fixtures of tests/fixtures (see
// tests/db/cases/70-api.sh, which imports them and runs this file with TEST_PG_PORT set). Skipped otherwise.
//
// __snapshots__/legacy/ holds the difference responses of the API before the candidates contract (properties
// named per source). They characterise which candidates each source and match mode returns: the contract
// responses must hold the same candidates (same objects, same geometry) with the same stats, and the JOSM
// exports (export-*.osm, also recorded before the contract) must stay byte for byte the same.
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'
import { CANDIDATES_CONTRACT, candidateToOsmFeature, type CandidateSource } from '~/utils/candidates'
import { geojsonToOsm } from '~/utils/geojsonToOsm'
import type { Feature, FeatureCollection, Position } from 'geojson'
import { asHandler, createEvent, runtimeConfig, stubNitro, type TestHandler } from '../server/nitro'

const PORT = process.env.TEST_PG_PORT

/** EPSG:3857 bounds [minX, minY, maxX, maxY] of a lon/lat box. */
function mercatorBounds(minLon: number, minLat: number, maxLon: number, maxLat: number): number[] {
  const R = 6378137
  const x = (lon: number) => (lon * Math.PI * R) / 180
  const y = (lat: number) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  return [x(minLon), y(minLat), x(maxLon), y(maxLat)]
}

const AREAS = {
  grb: mercatorBounds(4.399, 51.199, 4.412, 51.201),
  picc: mercatorBounds(4.869, 50.464, 4.873, 50.466),
  urbis: mercatorBounds(4.349, 50.845, 4.353, 50.847)
}

interface Stats {
  total: number
  totalGrb: number
  totalOsm: number
  dataSource: string
  matchMode: string
}

interface DifferenceResponse {
  type: 'FeatureCollection'
  features: Feature[]
  stats: Stats & { bounds?: unknown }
}

const round = (value: unknown): unknown =>
  Array.isArray(value) ? value.map(round) : typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value

/** Stable, readable JSON of a response: rounded coordinates, features sorted by their properties. */
function normalise(response: DifferenceResponse): string {
  const features = response.features
    .map((f) => ({
      properties: f.properties,
      coordinates: round((f.geometry as { coordinates: unknown }).coordinates)
    }))
    .toSorted((a, b) => JSON.stringify(a.properties).localeCompare(JSON.stringify(b.properties)))
  const { bounds: _bounds, ...stats } = response.stats
  return `${JSON.stringify({ stats, features }, null, 2)}\n`
}

/** The object id of a pre-contract feature (properties named per source), as the contract's source_id. */
const LEGACY_ID: Record<CandidateSource, (p: Record<string, unknown>) => string> = {
  grb: (p) => `${String(p.entity)}/${String(p.oidn)}`,
  knw: (p) => String(p.oidn),
  picc: (p) => String(p.objectid),
  urbis: (p) => String(p.building_id)
}

interface Candidate {
  id: string
  coordinates: number[]
}

const flat = (coordinates: unknown): number[] => (coordinates as Position[]).flat(Infinity) as number[]

/** The candidates of a pre-contract snapshot: id and rounded coordinates, sorted by id. */
function legacyCandidates(file: string, source: CandidateSource): { stats: Stats; candidates: Candidate[] } {
  const snapshot = JSON.parse(readFileSync(new URL(`__snapshots__/legacy/${file}`, import.meta.url), 'utf8')) as {
    stats: Stats
    features: { properties: Record<string, unknown>; coordinates: unknown }[]
  }
  const candidates = snapshot.features
    .map((f) => ({ id: LEGACY_ID[source](f.properties), coordinates: flat(f.coordinates) }))
    .toSorted((a, b) => a.id.localeCompare(b.id))
  return { stats: snapshot.stats, candidates }
}

/** The same for a contract response (GRB is identified by Entity/oidn, the others by their source id). */
function contractCandidates(response: DifferenceResponse): { stats: Stats; candidates: Candidate[] } {
  const candidates = response.features
    .map((f) => ({
      id: String(f.properties?.source === 'grb' ? f.properties.source_ref : f.properties?.source_id),
      coordinates: flat(round((f.geometry as { coordinates: unknown }).coordinates))
    }))
    .toSorted((a, b) => a.id.localeCompare(b.id))
  const { bounds: _bounds, ...stats } = response.stats
  return { stats, candidates }
}

/** The contract response has the candidates and stats of the pre-contract snapshot, coordinates within 2e-6°. */
function expectSameCandidates(response: DifferenceResponse, file: string, source: CandidateSource) {
  const legacy = legacyCandidates(file, source)
  const current = contractCandidates(response)
  expect(current.stats).toEqual(legacy.stats)
  expect(current.candidates.map((c) => c.id)).toEqual(legacy.candidates.map((c) => c.id))
  current.candidates.forEach((candidate, i) => {
    const expected = legacy.candidates[i]?.coordinates ?? []
    expect(candidate.coordinates).toHaveLength(expected.length)
    candidate.coordinates.forEach((value, j) => expect(Math.abs(value - (expected[j] ?? NaN))).toBeLessThan(2e-6))
  })
}

/** The JOSM export of a response, coordinates rounded to 6 decimals (about 10 cm) against reprojection noise. */
function exportXml(response: DifferenceResponse): string {
  const osm = geojsonToOsm({
    type: 'FeatureCollection',
    features: response.features.map(candidateToOsmFeature)
  } as FeatureCollection)
  return osm.replace(/(lat|lon)="(-?\d+\.\d+)"/g, (_m, axis: string, value: string) => {
    return `${axis}="${Number(value).toFixed(6)}"`
  })
}

/** "Gbg/1001"-style references of the GRB candidates in a response. */
const refs = (response: DifferenceResponse) => response.features.map((f) => String(f.properties?.source_ref)).toSorted()

describe.skipIf(!PORT)('API against the fixture database', () => {
  let difference: TestHandler
  let dataDates: TestHandler
  let closeDb: () => Promise<void>

  const post = async (body: Record<string, unknown>): Promise<DifferenceResponse> => {
    const event = createEvent({ body: { contract: CANDIDATES_CONTRACT, ...body } })
    const result = (await difference(event)) as DifferenceResponse
    if (event.sentError) throw event.sentError
    return result
  }

  // Globals are restored after every test (unstubGlobals), so stub them before each one
  beforeEach(() => {
    stubNitro({ ...runtimeConfig, dbHost: '127.0.0.1', dbPort: PORT, dbUser: 'be2osm', dbPassword: 'be2osm' })
  })

  beforeAll(async () => {
    stubNitro({ ...runtimeConfig, dbHost: '127.0.0.1', dbPort: PORT, dbUser: 'be2osm', dbPassword: 'be2osm' })
    difference = asHandler(await import('~/server/api/buildings/difference.post'))
    dataDates = asHandler(await import('~/server/api/meta/data-dates.get'))
    ;({ closeDbConnections: closeDb } = await import('~/server/utils/db'))
  })

  afterAll(async () => {
    await closeDb()
  })

  describe('GRB', () => {
    it('geometry mode: hides polygons matched by an OSM outline, keeps GBA polygons sharing a GBG OIDN', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'geometry' })
      // Gbg/1001 is matched by OSM 101; Gbg/1003 (virtual facades) and Gba/2001 (trap) are not building types
      expect(refs(response)).toEqual(['Gba/1001', 'Gbg/1002'])
      expect(response.stats).toMatchObject({ totalGrb: 3, totalOsm: 3 })
      expectSameCandidates(response, 'difference-grb-geometry.json', 'grb')
      await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-grb-geometry.json')
    })

    it('source mode: matches OSM source:geometry:ref per entity', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'source' })
      // OSM refs: Gbg/1002, Gba/1001. Gbg/1001 has no ref, so it stays a candidate despite sharing 1001.
      expect(refs(response)).toEqual(['Gbg/1001'])
      expectSameCandidates(response, 'difference-grb-source.json', 'grb')
      await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-grb-source.json')
    })

    it('both mode: a candidate must be unmatched by geometry and by source reference', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'both' })
      expect(refs(response)).toEqual([])
    })

    it('candidates carry the contract properties: reference, type, survey date, building, address', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'source' })
      expect(response.features[0]?.properties).toMatchObject({
        source: 'grb',
        entity: 'Gbg',
        source_id: '1001',
        source_ref: 'Gbg/1001',
        type_label: 'hoofdgebouw',
        survey_date: '2023-03-15',
        parent_id: '5001',
        addresses: 'Kerkstraat 1',
        address_count: 1,
        details: {}
      })
    })

    it('exports the GBA candidate with its own entity in the JOSM XML', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'geometry' })
      const osm = exportXml(response)
      expect(osm).toContain('<tag k="source:geometry:ref" v="Gba/1001"/>')
      expect(osm).toContain('<tag k="source:geometry:ref" v="Gbg/1002"/>')
      await expect(osm).toMatchFileSnapshot('__snapshots__/export-grb-geometry.osm')
    })
  })

  it('KNW geometry mode returns the kunstwerk with its type', async () => {
    const response = await post({ bounds: AREAS.grb, dataSource: 'knw', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.source_ref)).toEqual(['Knw/7001'])
    expectSameCandidates(response, 'difference-knw-geometry.json', 'knw')
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-knw-geometry.json')
  })

  it('PICC geometry mode hides the building matched by OSM', async () => {
    const response = await post({ bounds: AREAS.picc, dataSource: 'picc', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.source_id)).toEqual(['11'])
    expect(response.features[0]?.properties).toMatchObject({ addresses: 'Rue de Fer 5', address_count: 1 })
    expectSameCandidates(response, 'difference-picc-geometry.json', 'picc')
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-picc-geometry.json')
  })

  it('UrbIS geometry mode hides the building matched by OSM', async () => {
    const response = await post({ bounds: AREAS.urbis, dataSource: 'urbis', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.source_id)).toEqual(['21'])
    expect(response.features[0]?.properties).toMatchObject({ address_count: 2 })
    expectSameCandidates(response, 'difference-urbis-geometry.json', 'urbis')
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-urbis-geometry.json')
  })

  it.each([
    ['knw', AREAS.grb],
    ['picc', AREAS.picc],
    ['urbis', AREAS.urbis]
  ])('exports the %s candidates in the JOSM XML', async (dataSource, bounds) => {
    const response = await post({ bounds, dataSource, matchMode: 'geometry' })
    await expect(exportXml(response)).toMatchFileSnapshot(`__snapshots__/export-${dataSource}-geometry.osm`)
  })

  it('asks a page loaded before the contract to reload', async () => {
    const event = createEvent({ body: { bounds: AREAS.grb, dataSource: 'grb' } })
    await difference(event)
    expect(event.sentError?.statusCode).toBe(409)
  })

  it('readiness reports the applied migrations', async () => {
    const ready = asHandler(await import('~/server/api/health/ready.get'))
    const result = (await ready(createEvent())) as { ready: boolean; migrations: Record<string, string[]> }
    expect(result.ready).toBe(true)
    // Later releases add migrations: only the ones every release since this test was written has
    expect(result.migrations.grb).toEqual(
      expect.arrayContaining([
        '000_baseline',
        '001_polygon_entity',
        '002_polygon_entity_unique',
        '003_buildings_with_addresses_entity',
        '004_candidates'
      ])
    )
  })

  it('data-dates reports the import time of every source', async () => {
    const dates = (await dataDates(createEvent())) as Record<string, string | null>
    for (const source of ['grb', 'knw', 'picc', 'urbis']) {
      expect(dates[source], source).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
