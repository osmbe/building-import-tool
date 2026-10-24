// Edge cases of server/utils/overpass.ts: ring stitching, relation members, HTTP failures and retries, caching.
// The main behaviour is covered in tests/overpass.test.ts.
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  OverpassError,
  clearOverpassCache,
  fetchOverpassBuildings,
  overpassHttpError,
  parseOverpassElements,
  relationToPolygons,
  stitchRings
} from '~/server/utils/overpass'

type Ring = [number, number][]

const BBOX: [number, number, number, number] = [484000, 6594000, 484200, 6594200]
const SQUARE: Ring = [
  [0, 0],
  [0, 10],
  [10, 10],
  [10, 0],
  [0, 0]
]
const nodes = (ring: Ring) => ring.map(([lon, lat]) => ({ lat, lon }))

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, status })

afterEach(() => {
  clearOverpassCache()
  vi.useRealTimers()
})

async function overpassError(promise: Promise<unknown>): Promise<OverpassError> {
  try {
    await promise
  } catch (error) {
    if (error instanceof OverpassError) return error
    throw error
  }
  throw new Error('expected an OverpassError')
}

describe('stitchRings', () => {
  it.each([
    [
      'appending a segment that starts at the end',
      [
        [
          [0, 0],
          [0, 10],
          [10, 10]
        ],
        [
          [10, 10],
          [10, 0],
          [0, 0]
        ]
      ]
    ],
    [
      'appending a reversed segment that ends at the end',
      [
        [
          [0, 0],
          [0, 10],
          [10, 10]
        ],
        [
          [0, 0],
          [10, 0],
          [10, 10]
        ]
      ]
    ],
    [
      'prepending a segment that ends at the start',
      [
        [
          [10, 10],
          [10, 0],
          [0, 0]
        ],
        [
          [0, 0],
          [0, 10],
          [10, 10]
        ]
      ]
    ],
    [
      'prepending a reversed segment that starts at the start',
      [
        [
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0]
        ],
        [
          [0, 10],
          [0, 0]
        ]
      ]
    ]
  ] as [string, Ring[]][])('closes a ring by %s', (_label, segments) => {
    const rings = stitchRings(segments)
    expect(rings).toHaveLength(1)
    const ring = rings[0] ?? []
    expect(ring[0]).toEqual(ring.at(-1))
    expect(ring).toHaveLength(5)
  })

  it('skips segments that do not touch the current one', () => {
    const rings = stitchRings([
      [
        [0, 0],
        [0, 10]
      ],
      [
        [50, 50],
        [60, 60]
      ],
      [
        [0, 10],
        [10, 10],
        [0, 0]
      ]
    ])
    expect(rings).toHaveLength(1)
  })

  it('drops a stitched ring that is closed but degenerate', () => {
    expect(
      stitchRings([
        [
          [0, 0],
          [1, 1]
        ],
        [
          [1, 1],
          [0, 0]
        ]
      ])
    ).toEqual([])
  })
})

describe('relationToPolygons', () => {
  it('ignores non-way members, unknown roles and members without geometry', () => {
    const polygons = relationToPolygons([
      null,
      { role: 'outer', type: 'node' },
      { geometry: nodes(SQUARE), role: 'label', type: 'way' },
      { geometry: 'not-an-array', role: 'outer', type: 'way' },
      { geometry: nodes(SQUARE), role: '', type: 'way' }
    ])
    expect(polygons).toEqual([[SQUARE]])
  })

  it('drops inner rings outside every outer ring', () => {
    const farAway: Ring = [
      [100, 100],
      [100, 101],
      [101, 101],
      [100, 100]
    ]
    const polygons = relationToPolygons([
      { geometry: nodes(SQUARE), role: 'outer', type: 'way' },
      { geometry: nodes(farAway), role: 'inner', type: 'way' }
    ])
    expect(polygons).toEqual([[SQUARE]])
  })
})

describe('parseOverpassElements', () => {
  it('skips null elements, elements without geometry and degenerate closed ways', () => {
    const result = parseOverpassElements([
      null,
      { id: 1, lat: 0, lon: 0, type: 'node' },
      {
        geometry: nodes([
          [0, 0],
          [1, 1],
          [0, 0]
        ]),
        id: 2,
        type: 'way'
      },
      { geometry: nodes(SQUARE), id: 3, type: 'way' }
    ])
    expect(result.totalOsm).toBe(1)
    // A way without tags still becomes a building=yes feature
    expect(result.features[0]?.properties).toEqual({ building: 'yes', osm_id: 'way/3' })
  })

  it('keeps an already closed way as is', () => {
    const result = parseOverpassElements([{ geometry: nodes(SQUARE), id: 4, tags: { building: 'house' }, type: 'way' }])
    expect(result.features[0]?.geometry.coordinates).toEqual([SQUARE])
    expect(result.features[0]?.properties.building).toBe('house')
  })
})

describe('overpassHttpError', () => {
  it('maps 408 to a timeout', () => {
    expect(overpassHttpError(408, '').statusCode).toBe(504)
  })

  it('keeps the error body out of the message and only logs it when present', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = overpassHttpError(500, '<html>boom</html>')
    expect(error).toMatchObject({ message: 'Overpass request failed (500). Try again shortly.', statusCode: 502 })
    expect(warn).toHaveBeenCalledTimes(1)
    overpassHttpError(500, '')
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('fetchOverpassBuildings failures', () => {
  it.each([
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), 504, 'did not answer in time'],
    [Object.assign(new Error('a'), { name: 'AbortError' }), 504, 'did not answer in time'],
    [new Error('ECONNREFUSED'), 502, 'Could not reach Overpass'],
    ['offline', 502, 'Could not reach Overpass']
  ])('maps a network failure (%s) to %i', async (thrown, statusCode, message) => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(thrown))
    const error = await overpassError(fetchOverpassBuildings(BBOX))
    expect(error.statusCode).toBe(statusCode)
    expect(error.message).toContain(message)
  })

  it('reports an invalid (non-JSON) 200 answer as a heavy query', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<?xml?><osm/>', { status: 200 })))
    expect((await overpassError(fetchOverpassBuildings(BBOX))).statusCode).toBe(504)
  })

  it('retries once on a transient status, then succeeds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ elements: [{ geometry: nodes(SQUARE), id: 1, type: 'way' }] }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = fetchOverpassBuildings(BBOX)
    await vi.advanceTimersByTimeAsync(2000)
    expect((await pending).totalOsm).toBe(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after the retry with the last error', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const fetchMock = vi.fn().mockImplementation(async () => new Response('', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = overpassError(fetchOverpassBuildings(BBOX))
    await vi.advanceTimersByTimeAsync(2000)
    expect((await pending).statusCode).toBe(429)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry other statuses and tolerates an unreadable error body', async () => {
    const response = new Response(null, { status: 400 })
    vi.spyOn(response, 'text').mockRejectedValue(new Error('stream error'))
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)
    expect((await overpassError(fetchOverpassBuildings(BBOX))).statusCode).toBe(502)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('fetchOverpassBuildings answers and cache', () => {
  it('treats a body without elements as no buildings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ remark: 'runtime error' })))
    expect(await fetchOverpassBuildings(BBOX)).toMatchObject({ geomCollection: null, totalOsm: 0 })
  })

  it('does not cache failures', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(jsonResponse({ elements: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await overpassError(fetchOverpassBuildings(BBOX))
    expect((await fetchOverpassBuildings(BBOX)).totalOsm).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('expires cached results after 30 seconds', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse({ elements: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchOverpassBuildings(BBOX)
    now.mockReturnValue(1_010_000)
    await fetchOverpassBuildings(BBOX)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now.mockReturnValue(1_040_001)
    await fetchOverpassBuildings(BBOX)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
