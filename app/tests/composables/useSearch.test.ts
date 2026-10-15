import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { addToSearchHistory, getSearchHistory, searchLocations, type SearchResult } from '~/composables/useSearch'

const nominatim = (overrides: Record<string, any> = {}) => ({
  place_id: 1,
  licence: '',
  osm_type: 'way',
  osm_id: 10,
  lat: '50.85',
  lon: '4.35',
  display_name: 'Brussels, Belgium',
  address: { country: 'Belgium', state: 'Brussels-Capital', postcode: '1000' },
  boundingbox: ['50.8', '50.9', '4.3', '4.4'],
  type: 'city',
  class: 'place',
  importance: 1,
  ...overrides
})

const mockFetch = (body: unknown, ok = true, status = 200) => {
  const fn = vi.fn().mockResolvedValue({ ok, status, json: async () => body })
  vi.stubGlobal('fetch', fn)
  return fn
}

const memoryStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    store
  }
}

describe('searchLocations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns nothing for queries shorter than 3 characters without calling Nominatim', async () => {
    const fetchMock = mockFetch([])
    expect(await searchLocations('', 'osm')).toEqual([])
    expect(await searchLocations('  ab  ', 'osm')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('queries Nominatim restricted to Belgium and maps the results', async () => {
    const fetchMock = mockFetch([nominatim()])
    const results = await searchLocations('  Brussels ', 'osm')

    const [url, init] = fetchMock.mock.calls[0] ?? []
    const params = new URL(String(url)).searchParams
    expect(String(url)).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/)
    expect(params.get('q')).toBe('Brussels')
    expect(params.get('countrycodes')).toBe('be')
    expect(params.get('format')).toBe('json')
    expect(init.headers['User-Agent']).toBe('be2osm-core/1.0')

    expect(results).toEqual([
      {
        id: 'osm-1',
        displayName: 'Brussels, Belgium',
        type: 'city',
        coordinates: [4.35, 50.85],
        // Nominatim [minLat, maxLat, minLon, maxLon] -> [minLng, minLat, maxLng, maxLat]
        boundingBox: [4.3, 50.8, 4.4, 50.9],
        provider: 'osm',
        details: { country: 'Belgium', region: 'Brussels-Capital', postcode: '1000', category: 'place' }
      }
    ])
  })

  it('classifies result types and falls back to the region', async () => {
    mockFetch([
      nominatim({ class: 'building', type: 'yes' }),
      nominatim({ class: 'place', type: 'house' }),
      nominatim({ class: 'highway', type: 'residential' }),
      nominatim({ class: 'place', type: 'village' }),
      nominatim({ class: 'boundary', type: 'administrative' }),
      nominatim({ class: 'amenity', type: 'cafe', address: { region: 'Flanders' } }),
      nominatim({ class: 'place', type: 'hamlet' })
    ])
    const results = await searchLocations('somewhere', 'osm')
    expect(results.map((r) => r.type)).toEqual(['building', 'address', 'address', 'city', 'city', 'poi', 'poi'])
    expect(results[5]?.details?.region).toBe('Flanders')
  })

  it('warns about unsupported providers and still uses Nominatim', async () => {
    const fetchMock = mockFetch([])
    await searchLocations('Gent', 'google')
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"google" not supported'))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws on Nominatim errors', async () => {
    mockFetch([], false, 503)
    await expect(searchLocations('Gent', 'osm')).rejects.toThrow('Nominatim API error: 503')
    expect(console.error).toHaveBeenCalled()
  })
})

describe('search history', () => {
  const item = (id: string): SearchResult => ({
    id,
    displayName: id,
    type: 'city',
    coordinates: [4, 50],
    provider: 'osm'
  })

  it('is empty when nothing is stored or the stored value is invalid', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
    expect(getSearchHistory()).toEqual([])
    storage.store.set('search_history', '{not json')
    expect(getSearchHistory()).toEqual([])
  })

  it('prepends new items, keeps existing ones in place and caps at 10', () => {
    const storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)

    expect(addToSearchHistory(item('a')).map((h) => h.id)).toEqual(['a'])
    expect(addToSearchHistory(item('b')).map((h) => h.id)).toEqual(['b', 'a'])
    // Already present: unchanged order
    expect(addToSearchHistory(item('a')).map((h) => h.id)).toEqual(['b', 'a'])

    for (let i = 0; i < 12; i++) addToSearchHistory(item(`x${i}`))
    const history = getSearchHistory()
    expect(history).toHaveLength(10)
    expect(history[0]?.id).toBe('x11')
    expect(JSON.parse(storage.store.get('search_history') ?? '[]')).toEqual(history)
  })
})
