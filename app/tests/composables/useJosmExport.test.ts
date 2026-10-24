import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { Feature } from 'geojson'
import { ref } from 'vue'

const mapshaper = vi.hoisted(() => ({
  internal: { exportFileContent: vi.fn(), importGeoJSON: vi.fn() },
  simplify: vi.fn()
}))
vi.mock('mapshaper', () => mapshaper)

// Real converter by default; individual tests can force an empty result
vi.mock('~/utils/geojsonToOsm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/utils/geojsonToOsm')>()
  return { geojsonToOsm: vi.fn(actual.geojsonToOsm) }
})

const { geojsonToOsm } = await import('~/utils/geojsonToOsm')
const { useJosmExport } = await import('~/composables/useJosmExport')

const square = (x: number): Feature => ({
  geometry: {
    coordinates: [
      [
        [4.4 + x / 1000, 51.2],
        [4.4001 + x / 1000, 51.2],
        [4.4001 + x / 1000, 51.2001],
        [4.4 + x / 1000, 51.2001],
        [4.4 + x / 1000, 51.2]
      ]
    ],
    type: 'Polygon'
  },
  properties: {
    entity: 'Gbg',
    parent_id: '9',
    source: 'grb',
    source_id: String(2664 + x),
    source_ref: `Gbg/${2664 + x}`,
    survey_date: '2023-03-15',
    type_label: 'hoofdgebouw'
  },
  type: 'Feature'
})

interface FetchResponse {
  ok: boolean
  status?: number
  json?: () => Promise<unknown>
  text?: () => Promise<string>
}
const res = (ok: boolean, body: unknown = '', status = ok ? 200 : 500): FetchResponse => ({
  json: async () => body,
  ok,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
})

/** Fetch stub routing JOSM /version, /load_data, /load_and_zoom and uploaded /exports/ files. */
const stubFetch = (routes: {
  version?: FetchResponse
  loadData?: FetchResponse
  file?: FetchResponse
  zoom?: FetchResponse
}) => {
  const fn = vi.fn(async (url: string) => {
    if (url.endsWith('/version')) return routes.version ?? res(true, { protocolversion: { major: 1, minor: 10 } })
    if (url.includes('/load_data')) return routes.loadData ?? res(true, 'OK')
    if (url.includes('/exports/')) return routes.file ?? res(true, '<osm/>')
    if (url.includes('/load_and_zoom')) return routes.zoom ?? res(true)
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const loadDataParams = (fetchMock: ReturnType<typeof stubFetch>) => {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/load_data'))
  if (!call) throw new Error('load_data not called')
  return new URL(String(call[0])).searchParams
}

describe('useJosmExport', () => {
  beforeEach(() => {
    // Nuxt auto-imports
    vi.stubGlobal('ref', ref)
    vi.stubGlobal('$fetch', vi.fn())
    vi.stubGlobal('window', { location: { host: 'be2osm.example', protocol: 'https:' } })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mapshaper.internal.importGeoJSON.mockReset()
    mapshaper.internal.exportFileContent.mockReset()
    mapshaper.simplify.mockReset()
  })

  describe('testJosmConnection', () => {
    it('accepts a JOSM with remote control protocol >= 1.6', async () => {
      const fetchMock = stubFetch({})
      expect(await useJosmExport().testJosmConnection()).toBe(true)
      expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:8111/version', { method: 'GET' })
    })

    it('accepts a JOSM that reports no protocol version', async () => {
      stubFetch({ version: res(true, {}) })
      expect(await useJosmExport().testJosmConnection()).toBe(true)
    })

    it('rejects a too old JOSM', async () => {
      stubFetch({ version: res(true, { protocolversion: { major: 1, minor: 5 } }) })
      expect(await useJosmExport().testJosmConnection()).toBe(false)
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('too old'))
    })

    it('fails when JOSM answers with an error or is not running', async () => {
      stubFetch({ version: res(false) })
      expect(await useJosmExport().testJosmConnection()).toBe(false)
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      expect(await useJosmExport().testJosmConnection()).toBe(false)
    })

    it('uses the HTTPS remote control port when SSL is enabled', async () => {
      const fetchMock = stubFetch({})
      const josm = useJosmExport()
      josm.useSSL.value = true
      await josm.testJosmConnection()
      expect(fetchMock).toHaveBeenCalledWith('https://127.0.0.1:8112/version', { method: 'GET' })
    })
  })

  describe('exportLayerToJosm', () => {
    it('refuses to export when JOSM is not reachable', async () => {
      stubFetch({ version: res(false) })
      await expect(useJosmExport().exportLayerToJosm([square(0)])).rejects.toThrow('JOSM is not running')
    })

    it('refuses an empty selection', async () => {
      stubFetch({})
      await expect(useJosmExport().exportLayerToJosm([])).rejects.toThrow('No features to export')
    })

    it('sends small exports directly with OSM tags', async () => {
      const fetchMock = stubFetch({})
      const result = await useJosmExport().exportLayerToJosm([square(0)], 'GRB buildings')

      expect(result).toEqual({ featureCount: 1, fileUrl: null, method: 'direct', success: true })
      const params = loadDataParams(fetchMock)
      expect(params.get('layer_name')).toBe('GRB buildings')
      expect(params.get('upload_policy')).toBe('never')
      expect(params.get('new_layer')).toBe('true')
      const xml = params.get('data') ?? ''
      expect(xml).toContain('<osm version="0.6"')
      expect(xml).toContain('k="building" v="yes"')
      expect(xml).toContain('k="source:geometry:ref" v="Gbg/2664"')
      expect(xml).toContain('k="source:geometry:date" v="2023-03-15"')
      // Only OSM tags are exported, not the contract properties
      expect(xml).not.toContain('parent_id')
      expect(globalThis.$fetch).not.toHaveBeenCalled()
    })

    it('keeps the raw properties with includeMeta', async () => {
      const fetchMock = stubFetch({})
      await useJosmExport().exportLayerToJosm([square(0)], 'raw', { includeMeta: true })
      const xml = loadDataParams(fetchMock).get('data') ?? ''
      expect(xml).toContain('k="parent_id" v="9"')
      expect(xml).not.toContain('source:geometry:ref')
    })

    it('reports JOSM errors for direct exports', async () => {
      stubFetch({ loadData: res(false, 'bad request', 400) })
      await expect(useJosmExport().exportLayerToJosm([square(0)])).rejects.toThrow(
        'JOSM returned status 400: bad request'
      )
    })

    it('uploads to the backend on request and hands the file content to JOSM', async () => {
      const fetchMock = stubFetch({ file: res(true, '<osm>uploaded</osm>') })
      const fetchApi = vi.fn().mockResolvedValue({ fname: 'export-1.osm' })
      vi.stubGlobal('$fetch', fetchApi)

      const result = await useJosmExport().exportLayerToJosm([square(0)], 'layer', { uploadToBackend: true })

      expect(result).toEqual({
        featureCount: 1,
        fileUrl: 'https://be2osm.example/exports/export-1.osm',
        method: 'backend-upload',
        success: true
      })
      const [url, init] = fetchApi.mock.calls[0] ?? []
      expect(url).toBe('/api/export/upload')
      expect(init).toMatchObject({ headers: { 'Content-Type': 'application/xml' }, method: 'POST' })
      expect(String(init.body)).toContain('<osm version="0.6"')
      expect(fetchMock).toHaveBeenCalledWith('https://be2osm.example/exports/export-1.osm')
      expect(loadDataParams(fetchMock).get('data')).toBe('<osm>uploaded</osm>')
    })

    it('falls back to the backend upload when the URL would be too long', async () => {
      stubFetch({})
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ fname: 'big.osm' }))
      const features = Array.from({ length: 150 }, (_, i) => square(i))
      const result = await useJosmExport().exportLayerToJosm(features, 'big', { backendUrl: '/custom/upload' })
      expect(result.method).toBe('backend-upload')
      expect(result.featureCount).toBe(150)
      expect(globalThis.$fetch).toHaveBeenCalledWith('/custom/upload', expect.anything())
    })

    it('reports a missing uploaded file', async () => {
      stubFetch({ file: res(false, '', 404) })
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ fname: 'gone.osm' }))
      await expect(useJosmExport().exportLayerToJosm([square(0)], 'l', { uploadToBackend: true })).rejects.toThrow(
        'Backend upload failed: Failed to fetch uploaded file: 404'
      )
    })

    it('reports JOSM import errors after a backend upload', async () => {
      stubFetch({ loadData: res(false, 'nope', 500) })
      vi.stubGlobal('$fetch', vi.fn().mockResolvedValue({ fname: 'x.osm' }))
      await expect(useJosmExport().exportLayerToJosm([square(0)], 'l', { uploadToBackend: true })).rejects.toThrow(
        'Backend upload failed: JOSM import failed (500): nope'
      )
    })

    it('reports backend upload failures', async () => {
      stubFetch({})
      vi.stubGlobal('$fetch', vi.fn().mockRejectedValue(new Error('413 Payload Too Large')))
      await expect(useJosmExport().exportLayerToJosm([square(0)], 'l', { uploadToBackend: true })).rejects.toThrow(
        'Backend upload failed: 413 Payload Too Large'
      )
    })

    it('refuses to send an empty OSM document', async () => {
      stubFetch({})
      vi.mocked(geojsonToOsm).mockReturnValueOnce('')
      await expect(useJosmExport().exportLayerToJosm([square(0)])).rejects.toThrow(
        'geojsonToOsm generated empty output'
      )
    })
  })

  describe('simplification', () => {
    it('simplifies with mapshaper (Douglas-Peucker, keeping shapes) before converting', async () => {
      const fetchMock = stubFetch({})
      const simplified = { features: [square(7)], type: 'FeatureCollection' }
      mapshaper.internal.importGeoJSON.mockReturnValue('dataset')
      mapshaper.simplify.mockReturnValue('simplified')
      mapshaper.internal.exportFileContent.mockReturnValue([{ content: JSON.stringify(simplified) }])

      await useJosmExport().exportLayerToJosm([square(0)], 'l', { simplify: true, simplifyPercent: 50 })

      expect(mapshaper.simplify).toHaveBeenCalledWith('dataset', { keep_shapes: true, method: 'dp', percentage: 0.5 })
      expect(mapshaper.internal.exportFileContent).toHaveBeenCalledWith('simplified', { format: 'geojson' })
      // Mapshaper's output is what gets exported (tags were mapped before simplification)
      expect(mapshaper.internal.importGeoJSON.mock.calls[0]?.[0].features[0].properties['source:geometry:ref']).toBe(
        'Gbg/2664'
      )
      expect(loadDataParams(fetchMock).get('data')).toContain('lon="4.407"')
    })

    it('exports unsimplified data when mapshaper fails or returns nothing', async () => {
      const fetchMock = stubFetch({})
      mapshaper.internal.importGeoJSON.mockReturnValue('dataset')
      mapshaper.internal.exportFileContent.mockReturnValue([])
      await useJosmExport().exportLayerToJosm([square(0)], 'l', { simplify: true })
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('simplification failed'),
        expect.objectContaining({ message: 'Mapshaper returned no output' })
      )
      expect(loadDataParams(fetchMock).get('data')).toContain('Gbg/2664')

      mapshaper.internal.importGeoJSON.mockImplementation(() => {
        throw new Error('invalid geometry')
      })
      const result = await useJosmExport().exportLayerToJosm([square(0)], 'l', { simplify: true })
      expect(result.success).toBe(true)
    })

    it('skips mapshaper at 100%', async () => {
      stubFetch({})
      await useJosmExport().exportLayerToJosm([square(0)], 'l', { simplify: true, simplifyPercent: 100 })
      expect(mapshaper.internal.importGeoJSON).not.toHaveBeenCalled()
    })
  })

  describe('openAreaInJosm', () => {
    it('loads and zooms to the bbox', async () => {
      const fetchMock = stubFetch({})
      await useJosmExport().openAreaInJosm([4.3, 50.8, 4.4, 50.9])
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/load_and_zoom'))
      const params = new URL(String(call?.[0])).searchParams
      expect(Object.fromEntries(params)).toEqual({ bottom: '50.8', left: '4.3', right: '4.4', top: '50.9' })
    })

    it('fails when JOSM is not running or rejects the request', async () => {
      stubFetch({ version: res(false) })
      await expect(useJosmExport().openAreaInJosm([0, 0, 1, 1])).rejects.toThrow('JOSM is not running')
      stubFetch({ zoom: res(false, '', 403) })
      await expect(useJosmExport().openAreaInJosm([0, 0, 1, 1])).rejects.toThrow('JOSM returned status 403')
    })
  })

  it('exposes setup instructions and the default remote control URL', () => {
    const josm = useJosmExport()
    expect(josm.getJosmInstructions()).toHaveLength(8)
    expect(josm.josmBaseUrl.value).toBe('http://127.0.0.1:8111')
    expect(josm.useSSL.value).toBe(false)
  })
})
