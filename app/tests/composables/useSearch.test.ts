import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { type SearchResult, addToSearchHistory, getSearchHistory, searchLocations } from '~/composables/useSearch'

const nominatim = (overrides: Record<string, any> = {}) => ({
  address: { country: 'Belgium', postcode: '1000', state: 'Brussels-Capital' },
  boundingbox: ['50.8', '50.9', '4.3', '4.4'],
  class: 'place',
  display_name: 'Brussels, Belgium',
  importance: 1,
  lat: '50.85',
  licence: '',
  lon: '4.35',
  osm_id: 10,
  osm_type: 'way',
  place_id: 1,
  type: 'city',
  ...overrides
})

const mockFetch = (body: unknown, ok = true, status = 200) => {
  const fn = vi.fn().mockResolvedValue({ json: async () => body, ok, status })
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
    expect(await searchLocations('')).toEqual([])
    expect(await searchLocations('  ab  ')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('queries Nominatim restricted to Belgium and maps the results', async () => {
    const fetchMock = mockFetch([nominatim()])
    const results = await searchLocations('  Brussels ')

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
        details: { category: 'place', country: 'Belgium', postcode: '1000', region: 'Brussels-Capital' }
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
      nominatim({ address: { region: 'Flanders' }, class: 'amenity', type: 'cafe' }),
      nominatim({ class: 'place', type: 'hamlet' })
    ])
    const results = await searchLocations('somewhere')
    expect(results.map((r) => r.type)).toEqual(['building', 'address', 'address', 'city', 'city', 'poi', 'poi'])
    expect(results[5]?.details?.region).toBe('Flanders')
  })

  it('throws on Nominatim errors', async () => {
    mockFetch([], false, 503)
    await expect(searchLocations('Gent')).rejects.toThrow('Nominatim API error: 503')
    expect(console.error).toHaveBeenCalled()
  })
})

describe('search history', () => {
  const item = (id: string): SearchResult => ({
    coordinates: [4, 50],
    displayName: id,
    id,
    type: 'city'
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
