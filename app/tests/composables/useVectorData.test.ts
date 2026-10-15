import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { useVectorData } from '~/composables/useVectorData'

const bounds = { minLon: 4.3, minLat: 50.8, maxLon: 4.4, maxLat: 50.9 }

const response = (body: unknown, ok = true) => ({
  ok,
  status: ok ? 200 : 500,
  statusText: ok ? 'OK' : 'Internal Server Error',
  json: async () => body,
  arrayBuffer: async () => new ArrayBuffer(8)
})

describe('useVectorData', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('requests GeoJSON for a bbox and returns the parsed body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ type: 'FeatureCollection', features: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchVectorTileData, defaultSources } = useVectorData()
    const source = defaultSources[0]
    if (!source) throw new Error('missing default source')

    const data = await fetchVectorTileData(source, bounds)

    expect(data).toEqual({ type: 'FeatureCollection', features: [] })
    const [url, init] = fetchMock.mock.calls[0] ?? []
    const parsed = new URL(String(url))
    expect(`${parsed.origin}${parsed.pathname}`).toBe('http://127.0.0.1:3001/buildings')
    expect(parsed.searchParams.get('bbox')).toBe('4.3,50.8,4.4,50.9')
    expect(parsed.searchParams.get('limit')).toBe('10000')
    expect(parsed.searchParams.has('zoom')).toBe(false)
    expect(init.headers.Accept).toBe('application/json')
  })

  it('passes the zoom and returns raw bytes for MVT sources', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(null))
    vi.stubGlobal('fetch', fetchMock)
    const { fetchVectorTileData } = useVectorData()

    const data = await fetchVectorTileData(
      { name: 'tiles', url: 'http://x/t', layer: 't', format: 'mvt' },
      {
        ...bounds,
        zoom: 15
      }
    )

    expect(data).toBeInstanceOf(ArrayBuffer)
    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(new URL(String(url)).searchParams.get('zoom')).toBe('15')
    expect(init.headers.Accept).toBe('application/x-protobuf')
  })

  it('throws on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(null, false)))
    const { fetchVectorTileData } = useVectorData()
    await expect(
      fetchVectorTileData({ name: 'b', url: 'http://x/b', layer: 'b', format: 'geojson' }, bounds)
    ).rejects.toThrow('Failed to fetch data: 500 Internal Server Error')
    expect(console.error).toHaveBeenCalled()
  })

  it('combines all sources, tags features with their source and tolerates failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/buildings')
          ? response({ features: [{ type: 'Feature', properties: { oidn: 1 }, geometry: null }] })
          : response(null, false)
      )
    )
    const { getDataForBounds, fetchAllVectorData, defaultSources } = useVectorData()

    const all = await fetchAllVectorData(defaultSources, bounds)
    expect(all.addresses).toBeNull()
    expect(console.warn).toHaveBeenCalledWith('Failed to fetch addresses:', expect.any(Error))

    const combined = await getDataForBounds(bounds)
    expect(combined).toEqual({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { oidn: 1, source: 'buildings' }, geometry: null }]
    })
  })

  it('skips datasets without features when combining', () => {
    const { combineGeoJSONFeatures } = useVectorData()
    expect(combineGeoJSONFeatures({ a: null, b: {}, c: { features: [{ properties: {} }] } }).features).toEqual([
      { properties: { source: 'c' } }
    ])
  })

  it('creates Martin sources for the GRB, OSM or an explicit server', () => {
    const { createMartinSource, MARTIN_GRB_URL, MARTIN_OSM_URL } = useVectorData()
    expect(createMartinSource({ name: 'b', endpoint: 'buildings', layer: 'b' })).toEqual({
      name: 'b',
      url: `${MARTIN_GRB_URL}/buildings`,
      layer: 'b',
      format: 'geojson'
    })
    expect(createMartinSource({ name: 'o', endpoint: 'osm_buildings', layer: 'o', format: 'mvt' }).url).toBe(
      `${MARTIN_OSM_URL}/osm_buildings`
    )
    expect(createMartinSource({ name: 'c', endpoint: 'x', layer: 'x', baseUrl: 'https://tiles' }).url).toBe(
      'https://tiles/x'
    )
  })
})
