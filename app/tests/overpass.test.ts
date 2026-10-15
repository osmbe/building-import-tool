import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  bboxAreaKm2,
  buildOverpassQuery,
  clearOverpassCache,
  fetchOverpassBuildings,
  lonLatToMercator,
  mercatorToLonLat,
  overpassHttpError,
  parseOverpassElements,
  stitchRings
} from '~/server/utils/overpass'

// Small bbox in Web Mercator (roughly central Belgium); exact values are not asserted.
const BBOX_3857: [number, number, number, number] = [484000, 6594000, 484200, 6594200]

const mockFetch = (elements: any[], ok = true, status = 200) => {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => ({ elements }),
    text: async () => JSON.stringify({ elements })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  clearOverpassCache()
  vi.unstubAllGlobals()
})

describe('mercatorToLonLat', () => {
  it('maps the origin to lon/lat 0,0', () => {
    expect(mercatorToLonLat(0, 0)).toEqual([0, 0])
  })

  it('maps x = +/- the mercator radius to lon +/-180', () => {
    const R = 20037508.342789244
    expect(mercatorToLonLat(R, 0)[0]).toBeCloseTo(180, 6)
    expect(mercatorToLonLat(-R, 0)[0]).toBeCloseTo(-180, 6)
  })

  it('maps y = the mercator radius to the mercator latitude limit (~85.05)', () => {
    const R = 20037508.342789244
    expect(mercatorToLonLat(0, R)[1]).toBeCloseTo(85.0511, 3)
  })
})

describe('fetchOverpassBuildings', () => {
  it('builds a Polygon from a closed way', async () => {
    mockFetch([
      {
        type: 'way',
        geometry: [
          { lon: 0, lat: 0 },
          { lon: 0, lat: 1 },
          { lon: 1, lat: 1 },
          { lon: 1, lat: 0 },
          { lon: 0, lat: 0 }
        ],
        tags: { building: 'yes' }
      }
    ])

    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result.totalOsm).toBe(1)

    const collection = JSON.parse(result.geomCollection as string)
    expect(collection.type).toBe('GeometryCollection')
    expect(collection.geometries).toHaveLength(1)
    expect(collection.geometries[0].type).toBe('Polygon')
    expect(collection.geometries[0].coordinates[0]).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0]
    ])
  })

  it('closes an unclosed ring automatically', async () => {
    mockFetch([
      {
        type: 'way',
        geometry: [
          { lon: 0, lat: 0 },
          { lon: 0, lat: 1 },
          { lon: 1, lat: 1 },
          { lon: 1, lat: 0 }
        ],
        tags: { building: 'house' }
      }
    ])

    const result = await fetchOverpassBuildings(BBOX_3857)
    const ring = JSON.parse(result.geomCollection as string).geometries[0].coordinates[0]
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(ring).toHaveLength(5)
  })

  it('extracts GRB oidn from source:geometry:oidn and source:geometry:ref tags', async () => {
    mockFetch([
      {
        type: 'way',
        geometry: [
          { lon: 0, lat: 0 },
          { lon: 0, lat: 1 },
          { lon: 1, lat: 1 },
          { lon: 0, lat: 0 }
        ],
        tags: { building: 'yes', 'source:geometry:oidn': '111' }
      },
      {
        type: 'way',
        geometry: [
          { lon: 2, lat: 2 },
          { lon: 2, lat: 3 },
          { lon: 3, lat: 3 },
          { lon: 2, lat: 2 }
        ],
        tags: { building: 'yes', 'source:geometry:ref': 'Gbg/222;Gba/333' }
      }
    ])

    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result.sourceRefs.sort()).toEqual(['Gba/333', 'Gbg/111', 'Gbg/222'])
  })

  it('skips degenerate ways with fewer than 3 nodes', async () => {
    mockFetch([
      {
        type: 'way',
        geometry: [
          { lon: 0, lat: 0 },
          { lon: 1, lat: 1 }
        ],
        tags: { building: 'yes' }
      }
    ])
    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result.totalOsm).toBe(0)
    expect(result.geomCollection).toBeNull()
  })

  it('returns a null collection when Overpass yields no buildings', async () => {
    mockFetch([])
    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result).toEqual({
      geomCollection: null,
      geomCollection3857: null,
      totalOsm: 0,
      sourceRefs: [],
      features: []
    })
  })

  it('POSTs an Overpass QL query containing the converted bbox', async () => {
    const fn = mockFetch([])
    await fetchOverpassBuildings(BBOX_3857)

    expect(fn).toHaveBeenCalledOnce()
    const init = fn.mock.calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect(String(init?.body)).toContain('way%5B%22building%22%5D') // way["building"] url-encoded
  })

  it('identifies itself with a descriptive User-Agent (public Overpass answers 406 to generic clients)', async () => {
    const fn = mockFetch([])
    await fetchOverpassBuildings(BBOX_3857)
    const headers = fn.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined
    expect(headers?.['User-Agent']).toMatch(/be2osm/)
  })

  it('throws when Overpass returns a non-OK status', async () => {
    mockFetch([], false, 500)
    await expect(fetchOverpassBuildings(BBOX_3857)).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringMatching(/Overpass request failed \(500\)/)
    })
  })

  it('reuses a cached result for an identical bbox', async () => {
    const fn = mockFetch([])
    await fetchOverpassBuildings(BBOX_3857)
    await fetchOverpassBuildings(BBOX_3857)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('lonLatToMercator', () => {
  it('round-trips with mercatorToLonLat', () => {
    const [x, y] = lonLatToMercator(4.35, 50.85)
    const [lon, lat] = mercatorToLonLat(x, y)
    expect(lon).toBeCloseTo(4.35, 8)
    expect(lat).toBeCloseTo(50.85, 8)
  })
})

describe('bboxAreaKm2', () => {
  it('is roughly 0.04 km2 for a 200 m square', () => {
    expect(bboxAreaKm2(BBOX_3857)).toBeGreaterThan(0.01)
    expect(bboxAreaKm2(BBOX_3857)).toBeLessThan(0.05)
  })
})

describe('buildOverpassQuery', () => {
  it('queries both ways and relations tagged building', () => {
    const q = buildOverpassQuery(BBOX_3857)
    expect(q).toContain('way["building"]')
    expect(q).toContain('relation["building"]')
    expect(q).toContain('out geom tags')
  })
})

describe('stitchRings', () => {
  it('joins two half-rings (one reversed) into a single closed ring', () => {
    const a: [number, number][] = [
      [0, 0],
      [0, 1],
      [1, 1]
    ]
    const b: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1]
    ]
    const rings = stitchRings([a, b])
    expect(rings).toHaveLength(1)
    expect(rings[0]?.[0]).toEqual(rings[0]?.at(-1))
    expect(rings[0]).toHaveLength(5)
  })

  it('drops segments that cannot be closed', () => {
    expect(
      stitchRings([
        [
          [0, 0],
          [1, 1]
        ]
      ])
    ).toEqual([])
  })
})

describe('parseOverpassElements', () => {
  const square = (x: number, y: number, s: number) => [
    { lon: x, lat: y },
    { lon: x, lat: y + s },
    { lon: x + s, lat: y + s },
    { lon: x + s, lat: y },
    { lon: x, lat: y }
  ]

  it('builds a polygon with a hole from a multipolygon relation', () => {
    const result = parseOverpassElements([
      {
        type: 'relation',
        id: 5,
        tags: { building: 'yes', 'source:geometry:oidn': '42' },
        members: [
          { type: 'way', role: 'outer', geometry: square(0, 0, 10) },
          { type: 'way', role: 'inner', geometry: square(2, 2, 2) }
        ]
      }
    ])
    expect(result.totalOsm).toBe(1)
    expect(result.features[0]?.geometry.coordinates).toHaveLength(2)
    expect(result.features[0]?.properties.osm_id).toBe('relation/5')
    expect(result.sourceRefs).toEqual(['Gbg/42'])
  })

  it('provides a Web Mercator collection alongside the WGS84 one', () => {
    const result = parseOverpassElements([{ type: 'way', id: 1, geometry: square(4, 50, 0.001), tags: {} }])
    const wgs = JSON.parse(result.geomCollection as string)
    const merc = JSON.parse(result.geomCollection3857 as string)
    expect(wgs.geometries[0].coordinates[0][0][0]).toBeCloseTo(4)
    expect(merc.geometries[0].coordinates[0][0][0]).toBeGreaterThan(400000)
  })
})

describe('overpassHttpError', () => {
  it('maps rate limit and timeout statuses', () => {
    expect(overpassHttpError(429, '').statusCode).toBe(429)
    expect(overpassHttpError(504, '').statusCode).toBe(504)
    expect(overpassHttpError(500, 'boom').statusCode).toBe(502)
    expect(overpassHttpError(406, '<html><body><h1>406 Not Acceptable</h1></body></html>').message).not.toMatch(/</)
  })
})

describe('fetchOverpassBuildings limits', () => {
  it('rejects a bbox that is too large without calling Overpass', async () => {
    const fn = mockFetch([])
    await expect(fetchOverpassBuildings([0, 6000000, 20000, 6020000])).rejects.toMatchObject({ statusCode: 400 })
    expect(fn).not.toHaveBeenCalled()
  })
})
