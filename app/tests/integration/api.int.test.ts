// API integration tests against a real PostGIS loaded with the fixtures of tests/fixtures (see
// tests/db/cases/70-api.sh, which imports them and runs this file with TEST_PG_PORT set). Skipped otherwise.
//
// The response snapshots in __snapshots__/ characterise the current API output per source and match mode,
// so the data-model refactor can prove it returns the same candidates.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test'
import { filterFeatureProperties } from '~/utils/grbExportTags'
import { geojsonToOsm } from '~/utils/geojsonToOsm'
import type { Feature, FeatureCollection } from 'geojson'
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

interface DifferenceResponse {
  type: 'FeatureCollection'
  features: Feature[]
  stats: { total: number; totalGrb: number; totalOsm: number; dataSource: string; matchMode: string }
}

/** Stable, readable JSON of a response: rounded coordinates, features sorted by their properties. */
function normalise(response: DifferenceResponse): string {
  const round = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(round) : typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value
  const features = response.features
    .map((f) => ({
      properties: f.properties,
      coordinates: round((f.geometry as { coordinates: unknown }).coordinates)
    }))
    .toSorted((a, b) => JSON.stringify(a.properties).localeCompare(JSON.stringify(b.properties)))
  const { bounds: _bounds, ...stats } = response.stats as DifferenceResponse['stats'] & { bounds?: unknown }
  return `${JSON.stringify({ stats, features }, null, 2)}\n`
}

/** "Gbg/1001"-style keys of the GRB candidates in a response. */
const refs = (response: DifferenceResponse) =>
  response.features.map((f) => `${String(f.properties?.entity)}/${String(f.properties?.oidn)}`).toSorted()

describe.skipIf(!PORT)('API against the fixture database', () => {
  let difference: TestHandler
  let dataDates: TestHandler
  let closeDb: () => Promise<void>

  const post = async (body: Record<string, unknown>): Promise<DifferenceResponse> => {
    const event = createEvent({ body })
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
      await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-grb-geometry.json')
    })

    it('source mode: matches OSM source:geometry:ref per entity', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'source' })
      // OSM refs: Gbg/1002, Gba/1001. Gbg/1001 has no ref, so it stays a candidate despite sharing 1001.
      expect(refs(response)).toEqual(['Gbg/1001'])
      await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-grb-source.json')
    })

    it('both mode: a candidate must be unmatched by geometry and by source reference', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'both' })
      expect(refs(response)).toEqual([])
    })

    it('candidates carry their address and survey date', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'source' })
      expect(response.features[0]?.properties).toMatchObject({
        entity: 'Gbg',
        oidn: '1001',
        opndatum: '2023-03-15',
        lbltype: 'hoofdgebouw',
        addresses: 'Kerkstraat 1',
        // bigint COUNT: node-postgres returns it as a string (current behaviour, kept by the snapshots)
        address_count: '1'
      })
    })

    it('exports the GBA candidate with its own entity in the JOSM XML', async () => {
      const response = await post({ bounds: AREAS.grb, dataSource: 'grb', matchMode: 'geometry' })
      const osm = geojsonToOsm({
        type: 'FeatureCollection',
        features: response.features.map(filterFeatureProperties)
      } as FeatureCollection)
      expect(osm).toContain('<tag k="source:geometry:ref" v="Gba/1001"/>')
      expect(osm).toContain('<tag k="source:geometry:ref" v="Gbg/1002"/>')
      // Round coordinates to 6 decimals (about 10 cm) so reprojection noise doesn't change the snapshot
      const rounded = osm.replace(/(lat|lon)="(-?\d+\.\d+)"/g, (_m, axis: string, value: string) => {
        return `${axis}="${Number(value).toFixed(6)}"`
      })
      await expect(rounded).toMatchFileSnapshot('__snapshots__/export-grb-geometry.osm')
    })
  })

  it('KNW geometry mode returns the kunstwerk with its type', async () => {
    const response = await post({ bounds: AREAS.grb, dataSource: 'knw', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.oidn)).toEqual(['7001'])
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-knw-geometry.json')
  })

  it('PICC geometry mode hides the building matched by OSM', async () => {
    const response = await post({ bounds: AREAS.picc, dataSource: 'picc', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.objectid)).toEqual(['11'])
    expect(response.features[0]?.properties).toMatchObject({ addresses: 'Rue de Fer 5', address_count: '1' })
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-picc-geometry.json')
  })

  it('Urbis geometry mode hides the building matched by OSM', async () => {
    const response = await post({ bounds: AREAS.urbis, dataSource: 'urbis', matchMode: 'geometry' })
    expect(response.features.map((f) => f.properties?.building_id)).toEqual(['21'])
    expect(response.features[0]?.properties).toMatchObject({ address_count: '2' })
    await expect(normalise(response)).toMatchFileSnapshot('__snapshots__/difference-urbis-geometry.json')
  })

  it('readiness reports the applied migrations', async () => {
    const ready = asHandler(await import('~/server/api/health/ready.get'))
    const result = (await ready(createEvent())) as { ready: boolean; migrations: Record<string, string[]> }
    expect(result.ready).toBe(true)
    expect(result.migrations.grb).toEqual([
      '001_polygon_entity',
      '002_polygon_entity_unique',
      '003_buildings_with_addresses_entity'
    ])
  })

  it('data-dates reports the import time of every source', async () => {
    const dates = (await dataDates(createEvent())) as Record<string, string | null>
    for (const source of ['grb', 'knw', 'picc', 'urbis']) {
      expect(dates[source], source).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    }
  })
})
