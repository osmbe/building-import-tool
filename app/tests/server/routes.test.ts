import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { OverpassError } from '~/server/utils/overpass'
import { asHandler, createEvent, expectHttpError, stubNitro } from './nitro'

const fsMock = vi.hoisted(() => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  readFile: vi.fn()
}))
const db = vi.hoisted(() => ({ queryGrb: vi.fn() }))
const overpass = vi.hoisted(() => ({ fetchOverpassBuildings: vi.fn() }))

vi.mock('fs', () => ({ promises: fsMock, default: { promises: fsMock } }))
vi.mock('fs/promises', () => ({ readFile: fsMock.readFile, default: { readFile: fsMock.readFile } }))
vi.mock('../../server/utils/db', () => db)
vi.mock('~/server/utils/overpass', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/server/utils/overpass')>()),
  fetchOverpassBuildings: overpass.fetchOverpassBuildings
}))

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  stubNitro()
  for (const fn of Object.values(fsMock)) fn.mockReset()
  db.queryGrb.mockReset()
  overpass.fetchOverpassBuildings.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/health', () => {
  const load = async () => asHandler(await import('~/server/api/health.get'))

  it('reports healthy', async () => {
    expect(await (await load())(createEvent())).toMatchObject({ status: 'healthy', service: 'be2osm-nuxt' })
  })

  it('reports unhealthy with 503 when a check throws', async () => {
    vi.spyOn(process, 'uptime').mockImplementation(() => {
      throw new Error('no uptime')
    })
    const event = createEvent()
    expect(await (await load())(event)).toMatchObject({ status: 'unhealthy', error: 'no uptime' })
    expect(event.status).toBe(503)
  })

  it('reports an unknown error for non-Error failures', async () => {
    vi.spyOn(process, 'uptime').mockImplementation(() => {
      throw 'boom'
    })
    expect(await (await load())(createEvent())).toMatchObject({ error: 'Unknown error' })
  })
})

describe('GET /api/meta/data-dates', () => {
  it('reads the import dates through the GRB pool', async () => {
    db.queryGrb.mockResolvedValue([{ imported_at: '2026-01-02T03:04:05Z' }])
    const handler = asHandler(await import('~/server/api/meta/data-dates.get'))
    expect(await handler(createEvent())).toEqual({
      grb: '2026-01-02T03:04:05.000Z',
      knw: '2026-01-02T03:04:05.000Z',
      picc: '2026-01-02T03:04:05.000Z',
      urbis: '2026-01-02T03:04:05.000Z'
    })
    expect(db.queryGrb).toHaveBeenCalledWith('SELECT max(imported_at) AS imported_at FROM picc.import_meta')
  })
})

describe('POST /api/buildings/osm-live', () => {
  const load = async () => asHandler(await import('~/server/api/buildings/osm-live.post'))
  const BOUNDS = [1, 2, 3, 4]

  it.each([[undefined], [[1, 2, 3]], [[1, 2, 3, '4']]])('answers 400 for bounds %j', async (bounds) => {
    const event = createEvent({ body: { bounds } })
    await (
      await load()
    )(event)
    expect(event.sentError?.statusCode).toBe(400)
    expect(overpass.fetchOverpassBuildings).not.toHaveBeenCalled()
  })

  it('returns the live footprints as a FeatureCollection', async () => {
    const feature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: { osm_id: 'way/1' } }
    overpass.fetchOverpassBuildings.mockResolvedValue({ features: [feature], totalOsm: 1 })
    const result = await (await load())(createEvent({ body: { bounds: BOUNDS } }))
    expect(overpass.fetchOverpassBuildings).toHaveBeenCalledWith(BOUNDS)
    expect(result).toEqual({ type: 'FeatureCollection', features: [feature], stats: { totalOsm: 1 } })
  })

  it.each([
    [new OverpassError('rate limited', 429), 429, 'rate limited'],
    [new Error('socket hang up'), 500, 'socket hang up'],
    ['weird', 500, 'Live OSM request failed']
  ])('maps a %s failure to its status', async (error, statusCode, statusMessage) => {
    overpass.fetchOverpassBuildings.mockRejectedValue(error)
    const event = createEvent({ body: { bounds: BOUNDS } })
    await (
      await load()
    )(event)
    expect(event.sentError).toMatchObject({ statusCode, statusMessage })
  })
})

describe('GET /api/proxy/brussels-wms', () => {
  const load = async () => asHandler(await import('~/server/api/proxy/brussels-wms.get'))

  it('clamps tile size, translates EPSG:3857 and drops FORMAT_OPTIONS', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } })
      )
    vi.stubGlobal('fetch', fetchMock)
    const event = createEvent({
      query: { WIDTH: '512', height: '512', CRS: 'EPSG:3857', LAYERS: 'urbisFR', FORMAT_OPTIONS: 'dpi:180' }
    })

    const body = await (await load())(event)

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.origin + url.pathname).toBe('https://geoservices-urbis.irisnet.be/geowebcache/service/wms')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      WIDTH: '256',
      height: '256',
      CRS: 'EPSG:900913',
      LAYERS: 'urbisFR'
    })
    expect(event.responseHeaders['Content-Type']).toBe('image/png')
    expect(Buffer.isBuffer(body)).toBe(true)
    expect([...(body as Buffer)]).toEqual([1, 2, 3])
  })

  it('defaults the content type to JPEG', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([9]), { status: 200 })))
    const event = createEvent()
    await (
      await load()
    )(event)
    expect(event.responseHeaders['Content-Type']).toBe('image/jpeg')
  })

  it('forwards an upstream error status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('nope', { status: 503, statusText: 'Service Unavailable' }))
    )
    const error = await expectHttpError((await load())(createEvent()))
    expect(error).toMatchObject({ statusCode: 503, statusMessage: 'Service Unavailable' })
  })
})

describe('POST /api/export/upload', () => {
  const load = async () => asHandler(await import('~/server/api/export/upload.post'))
  const OSM_XML = '<?xml version="1.0"?><osm version="0.6"></osm>'

  beforeEach(() => {
    fsMock.readdir.mockResolvedValue([])
  })

  it.each([[undefined], [''], [{ xml: OSM_XML }]])('rejects a %j body', async (body) => {
    const error = await expectHttpError((await load())(createEvent({ body })))
    expect(error.statusCode).toBe(400)
  })

  it('rejects payloads over 10 MB', async () => {
    const body = `<osm>${'x'.repeat(10 * 1024 * 1024)}</osm>`
    expect((await expectHttpError((await load())(createEvent({ body })))).statusCode).toBe(413)
  })

  it('rejects text that is not OSM XML', async () => {
    const error = await expectHttpError((await load())(createEvent({ body: 'hello' })))
    expect(error.message).toContain('Invalid OSM-XML format')
  })

  it('stores the file under a random name and returns its URL', async () => {
    const event = createEvent({ body: OSM_XML, headers: { 'x-forwarded-proto': 'https', host: 'be2osm.test' } })
    const result = await (await load())(event)

    expect(result.status).toBe('stored')
    expect(result.fname).toMatch(/^[a-f0-9]{32}\.osm$/)
    expect(result.url).toBe(`https://be2osm.test/exports/${result.fname}`)
    expect(fsMock.mkdir).toHaveBeenCalledWith(expect.stringMatching(/public[/\\]exports$/), { recursive: true })
    const [path, content] = fsMock.writeFile.mock.calls[0] as [string, string]
    expect(path.endsWith(result.fname)).toBe(true)
    expect(path).not.toContain('.output')
    expect(content).toBe(OSM_XML)
  })

  it('defaults to http://localhost:3000 in development and https in production', async () => {
    expect((await (await load())(createEvent({ body: '<osm/>' }))).url).toMatch(/^http:\/\/localhost:3000\/exports\//)

    vi.stubEnv('NODE_ENV', 'production')
    const result = await (await load())(createEvent({ body: '<osm/>' }))
    expect(result.url).toMatch(/^https:\/\/localhost:3000\/exports\//)
    expect(fsMock.mkdir.mock.calls.at(-1)?.[0]).toMatch(/\.output[/\\]public[/\\]exports$/)
  })

  it('answers 500 when the file cannot be written', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    fsMock.writeFile.mockRejectedValue(new Error('EACCES'))
    const error = await expectHttpError((await load())(createEvent({ body: OSM_XML })))
    expect(error.statusCode).toBe(500)
  })

  it('deletes export files older than an hour, leaving other files alone', async () => {
    const now = Date.now()
    fsMock.readdir.mockResolvedValue(['abc.osm', 'notes.txt', 'def.osm', 'old.osm'])
    fsMock.stat.mockImplementation(async (path: string) => ({
      mtimeMs: path.endsWith('abc.osm') ? now - 2 * 60 * 60 * 1000 : now
    }))
    fsMock.unlink.mockRejectedValue(new Error('already gone'))

    await (
      await load()
    )(createEvent({ body: OSM_XML }))
    await flushPromises()

    // "old.osm" is not a generated name (not hex), "notes.txt" is not an export
    expect(fsMock.stat).toHaveBeenCalledTimes(2)
    expect(fsMock.unlink).toHaveBeenCalledTimes(1)
    expect(String(fsMock.unlink.mock.calls[0]?.[0])).toMatch(/abc\.osm$/)
  })

  it('ignores a cleanup failure', async () => {
    fsMock.readdir.mockRejectedValue(new Error('ENOENT'))
    const result = await (await load())(createEvent({ body: OSM_XML }))
    await flushPromises()
    expect(result.status).toBe('stored')
  })
})

describe('GET /exports/:filename', () => {
  const load = async () => asHandler(await import('~/server/routes/exports/[filename].get'))
  const FILE = 'abc123.osm'

  it.each([[undefined], ['../secret.osm'], ['ABC.osm'], ['abc.xml']])('rejects the filename %j', async (name) => {
    const params: Record<string, string> = name === undefined ? {} : { filename: name }
    const error = await expectHttpError((await load())(createEvent({ params })))
    expect(error.statusCode).toBe(400)
    expect(fsMock.readFile).not.toHaveBeenCalled()
  })

  it('serves the export as inline XML', async () => {
    fsMock.readFile.mockResolvedValue('<osm/>')
    const event = createEvent({ params: { filename: FILE } })
    expect(await (await load())(event)).toBe('<osm/>')
    expect(String(fsMock.readFile.mock.calls[0]?.[0])).toMatch(/public[/\\]exports[/\\]abc123\.osm$/)
    expect(event.responseHeaders).toEqual({
      'Content-Type': 'application/xml',
      'Content-Disposition': `inline; filename="${FILE}"`
    })
  })

  it('reads from .output in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    fsMock.readFile.mockResolvedValue('<osm/>')
    await (
      await load()
    )(createEvent({ params: { filename: FILE } }))
    expect(String(fsMock.readFile.mock.calls[0]?.[0])).toContain('.output')
  })

  it('answers 404 for a missing (expired) export', async () => {
    fsMock.readFile.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    expect((await expectHttpError((await load())(createEvent({ params: { filename: FILE } })))).statusCode).toBe(404)
  })

  it('answers 500 for other read errors', async () => {
    fsMock.readFile.mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }))
    expect((await expectHttpError((await load())(createEvent({ params: { filename: FILE } })))).statusCode).toBe(500)
  })
})
