import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOverpassBuildings, mercatorToLonLat } from '~/server/utils/overpass'

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
          { lon: 0, lat: 0 }, { lon: 0, lat: 1 }, { lon: 1, lat: 1 }, { lon: 1, lat: 0 }, { lon: 0, lat: 0 }
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
      [0, 0], [0, 1], [1, 1], [1, 0], [0, 0]
    ])
  })

  it('closes an unclosed ring automatically', async () => {
    mockFetch([
      {
        type: 'way',
        geometry: [{ lon: 0, lat: 0 }, { lon: 0, lat: 1 }, { lon: 1, lat: 1 }, { lon: 1, lat: 0 }],
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
        geometry: [{ lon: 0, lat: 0 }, { lon: 0, lat: 1 }, { lon: 1, lat: 1 }, { lon: 0, lat: 0 }],
        tags: { building: 'yes', 'source:geometry:oidn': '111' }
      },
      {
        type: 'way',
        geometry: [{ lon: 2, lat: 2 }, { lon: 2, lat: 3 }, { lon: 3, lat: 3 }, { lon: 2, lat: 2 }],
        tags: { building: 'yes', 'source:geometry:ref': 'Gbg/222' }
      }
    ])

    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result.oidnList.sort()).toEqual(['111', '222'])
  })

  it('skips degenerate ways with fewer than 3 nodes', async () => {
    mockFetch([
      { type: 'way', geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }], tags: { building: 'yes' } }
    ])
    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result.totalOsm).toBe(0)
    expect(result.geomCollection).toBeNull()
  })

  it('returns a null collection when Overpass yields no buildings', async () => {
    mockFetch([])
    const result = await fetchOverpassBuildings(BBOX_3857)
    expect(result).toEqual({ geomCollection: null, totalOsm: 0, oidnList: [] })
  })

  it('POSTs an Overpass QL query containing the converted bbox', async () => {
    const fn = mockFetch([])
    await fetchOverpassBuildings(BBOX_3857)

    expect(fn).toHaveBeenCalledOnce()
    const [, init] = fn.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(String(init.body)).toContain('way%5B%22building%22%5D') // way["building"] url-encoded
  })

  it('throws when Overpass returns a non-OK status', async () => {
    mockFetch([], false, 429)
    await expect(fetchOverpassBuildings(BBOX_3857)).rejects.toThrow(/Overpass request failed \(429\)/)
  })
})
