// Overpass API helper (issue #9): source OSM buildings live for the current bbox,
// As an opt-in alternative to the daily-refreshed Postgres mirror. This lets the
// Difference tool reflect very recent OSM edits without waiting for the next import.

import { parseOsmSourceRefs } from '../../utils/osmSourceOidn'

const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter'
const MERCATOR_R = 20037508.342789244

/** Server-side request timeout (ms). The Overpass query itself has a shorter `[timeout:]`. */
const REQUEST_TIMEOUT_MS = 30_000
/** Largest view (km2) we will send to Overpass. About a city block to a small town centre. */
export const MAX_BBOX_KM2 = 12
/** Results are reused for a short while so the difference and the map layer share one request. */
const CACHE_TTL_MS = 30_000
const RETRY_DELAY_MS = 2_000
/**
 * The public Overpass instances reject generic clients (Node's default User-Agent gets HTTP 406),
 * so identify the tool as their usage policy asks.
 */
const USER_AGENT =
  process.env.OVERPASS_USER_AGENT || 'be2osm-building-import-tool (+https://github.com/osmbe/building-import-tool)'

type Ring = [number, number][]
type Bounds3857 = [number, number, number, number]

/** Error carrying the HTTP status the API should answer with. */
export class OverpassError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'OverpassError'
    this.statusCode = statusCode
  }
}

/** Convert a Web Mercator (EPSG:3857) coordinate to WGS84 lon/lat. */
export function mercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / MERCATOR_R) * 180
  let lat = (y / MERCATOR_R) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

/** Convert WGS84 lon/lat to Web Mercator (EPSG:3857). */
export function lonLatToMercator(lon: number, lat: number): [number, number] {
  const x = (lon * MERCATOR_R) / 180
  const y = (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * (MERCATOR_R / 180)
  return [x, y]
}

/** Approximate area (km2) of a Web Mercator bbox. */
export function bboxAreaKm2(bounds3857: Bounds3857): number {
  const [west, south] = mercatorToLonLat(bounds3857[0], bounds3857[1])
  const [east, north] = mercatorToLonLat(bounds3857[2], bounds3857[3])
  const midLat = ((south + north) / 2) * (Math.PI / 180)
  const width = Math.abs(east - west) * Math.cos(midLat) * 111.32
  const height = Math.abs(north - south) * 110.57
  return width * height
}

/** Overpass QL for ways and relations tagged building=* inside the bbox (south, west, north, east). */
export function buildOverpassQuery(bounds3857: Bounds3857): string {
  const [west, south] = mercatorToLonLat(bounds3857[0], bounds3857[1])
  const [east, north] = mercatorToLonLat(bounds3857[2], bounds3857[3])
  const bbox = `${south},${west},${north},${east}`
  return `[out:json][timeout:25];(way["building"](${bbox});relation["building"](${bbox}););out geom tags;`
}

const sameCoord = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1]

function toRing(geometry: unknown): Ring {
  if (!Array.isArray(geometry)) return []
  return geometry
    .filter((n: any) => n && typeof n.lon === 'number' && typeof n.lat === 'number')
    .map((n: any): [number, number] => [n.lon, n.lat])
}

/** Close a ring if needed; returns null if it is degenerate (fewer than 4 positions once closed). */
function closeRing(ring: Ring): Ring | null {
  const first = ring[0]
  const last = ring.at(-1)
  if (ring.length < 3 || !first || !last) return null
  const closed = sameCoord(first, last) ? ring : [...ring, [first[0], first[1]] as [number, number]]
  return closed.length < 4 ? null : closed
}

/**
 * Join open way segments end to end into closed rings (multipolygon members are often split
 * into several ways). Segments that cannot be closed are dropped.
 */
export function stitchRings(segments: Ring[]): Ring[] {
  const rings: Ring[] = []
  const pending = segments.filter((s) => s.length >= 2).map((s) => [...s])

  while (pending.length > 0) {
    let current = pending.shift() as Ring
    let progressed = true
    while (progressed) {
      const start = current[0]
      const end = current.at(-1)
      if (!start || !end || sameCoord(start, end)) break
      progressed = false
      for (let i = 0; i < pending.length; i++) {
        const seg = pending[i] as Ring
        const segStart = seg[0]
        const segEnd = seg.at(-1)
        if (!segStart || !segEnd) continue
        if (sameCoord(end, segStart)) current = [...current, ...seg.slice(1)]
        else if (sameCoord(end, segEnd)) current = [...current, ...[...seg].reverse().slice(1)]
        else if (sameCoord(start, segEnd)) current = [...seg, ...current.slice(1)]
        else if (sameCoord(start, segStart)) current = [...[...seg].reverse(), ...current.slice(1)]
        else continue
        pending.splice(i, 1)
        progressed = true
        break
      }
    }
    const first = current[0]
    const last = current.at(-1)
    if (first && last && sameCoord(first, last)) {
      const closed = closeRing(current)
      if (closed) rings.push(closed)
    }
  }
  return rings
}

function pointInRing(point: [number, number], ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (!a || !b) continue
    if (a[1] > point[1] !== b[1] > point[1] && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0])
      inside = !inside
  }
  return inside
}

/** Build polygons (outer ring first, then holes) from the members of a multipolygon relation. */
export function relationToPolygons(members: any[]): Ring[][] {
  const outerSegments: Ring[] = []
  const innerSegments: Ring[] = []
  for (const m of members) {
    if (!m || m.type !== 'way') continue
    const ring = toRing(m.geometry)
    if (m.role === 'inner') innerSegments.push(ring)
    else if (m.role === 'outer' || m.role === '') outerSegments.push(ring)
  }

  const polygons: Ring[][] = stitchRings(outerSegments).map((outer) => [outer])
  for (const inner of stitchRings(innerSegments)) {
    const probe = inner[0]
    if (!probe) continue
    const host = polygons.find((p) => p[0] && pointInRing(probe, p[0]))
    if (host) host.push(inner)
  }
  return polygons
}

export interface OverpassFeature {
  type: 'Feature'
  geometry: { type: 'Polygon'; coordinates: Ring[] }
  properties: Record<string, string>
}

export interface OverpassBuildings {
  /** GeoJSON GeometryCollection (EPSG:4326) of building footprints, or null if none. */
  geomCollection: string | null
  /** Same collection in Web Mercator (EPSG:3857), for the PICC / UrbIS queries. */
  geomCollection3857: string | null
  /** Number of building footprints returned. */
  totalOsm: number
  /** GRB OIDN references found in OSM tags (source:geometry:oidn / source:geometry:ref). */
  /** GRB references ("Gbg/123") found in source:geometry:* tags, for source-tag matching. */
  sourceRefs: string[]
  /** The same footprints as GeoJSON features (EPSG:4326), for drawing the live map layer. */
  features: OverpassFeature[]
}

/** Turn an Overpass JSON `elements` array (out geom) into building footprints. */
export function parseOverpassElements(elements: any[]): OverpassBuildings {
  const polygons: { coords: Ring[]; tags: Record<string, string>; id: string }[] = []
  const sourceRefSet = new Set<string>()

  for (const el of elements) {
    if (!el) continue
    const tags: Record<string, string> = el.tags || {}
    let coords: Ring[][] = []

    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const ring = closeRing(toRing(el.geometry))
      if (ring) coords = [[ring]]
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      coords = relationToPolygons(el.members)
    }

    if (coords.length === 0) continue

    for (const poly of coords) polygons.push({ coords: poly, id: `${el.type}/${el.id ?? ''}`, tags })

    // Collect GRB references for source-tag matching
    for (const id of parseOsmSourceRefs({
      entity: tags['source:geometry:entity'],
      oidn: tags['source:geometry:oidn'],
      ref: tags['source:geometry:ref']
    }))
      sourceRefSet.add(id)
  }

  const toMercator = (poly: Ring[]): Ring[] => poly.map((r) => r.map(([lon, lat]) => lonLatToMercator(lon, lat)))
  const collection = (project: (p: Ring[]) => Ring[]) =>
    polygons.length > 0
      ? JSON.stringify({
          geometries: polygons.map((p) => ({ coordinates: project(p.coords), type: 'Polygon' })),
          type: 'GeometryCollection'
        })
      : null

  return {
    features: polygons.map((p) => ({
      geometry: { coordinates: p.coords, type: 'Polygon' },
      properties: {
        building: p.tags.building || 'yes',
        osm_id: p.id,
        ...(p.tags['source:geometry:oidn'] ? { 'source:geometry:oidn': p.tags['source:geometry:oidn'] } : {}),
        ...(p.tags['source:geometry:ref'] ? { 'source:geometry:ref': p.tags['source:geometry:ref'] } : {})
      },
      type: 'Feature'
    })),
    geomCollection: collection((p) => p),
    geomCollection3857: collection(toMercator),
    sourceRefs: Array.from(sourceRefSet),
    totalOsm: polygons.length
  }
}

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Map an Overpass HTTP failure to a user-facing error with the status we answer with. */
export function overpassHttpError(status: number, text: string): OverpassError {
  if (status === 429)
    return new OverpassError('Overpass is rate limiting requests. Wait a few seconds and try again.', 429)

  if (status === 504 || status === 408)
    return new OverpassError('Overpass timed out (server busy). Try a smaller area or retry shortly.', 504)

  if (text) console.warn(`[overpass] HTTP ${status}:`, text.slice(0, 500))
  // The body is usually an HTML or Markdown error page: log it, but keep it out of the user-facing message.
  return new OverpassError(`Overpass request failed (${status}). Try again shortly.`, 502)
}

async function requestOverpass(query: string): Promise<{ elements?: any[] }> {
  let lastError: OverpassError | null = null
  // One retry on rate limit / overload / gateway timeout: those are usually transient on the public instances.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response
    try {
      response = await fetch(OVERPASS_ENDPOINT, {
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT
        },
        method: 'POST',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      })
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
      throw new OverpassError(
        timedOut
          ? 'Overpass did not answer in time. Try a smaller area or retry shortly.'
          : 'Could not reach Overpass.',
        timedOut ? 504 : 502
      )
    }

    if (response.ok)
      try {
        return (await response.json()) as { elements?: any[] }
      } catch {
        // Overpass answers 200 with an HTML/XML error body when it runs out of time or memory.
        throw new OverpassError('Overpass returned an invalid response (query probably too heavy).', 504)
      }

    lastError = overpassHttpError(response.status, await response.text().catch(() => ''))
    if (attempt === 0 && [429, 502, 503, 504].includes(response.status)) {
      await sleep(RETRY_DELAY_MS)
      continue
    }
    break
  }
  throw lastError ?? new OverpassError('Overpass request failed.', 502)
}

const cache = new Map<string, { at: number; promise: Promise<OverpassBuildings> }>()

/** Drop cached results (used by tests). */
export function clearOverpassCache() {
  cache.clear()
}

/**
 * Fetch OSM building footprints (ways and multipolygon relations) in the given Web Mercator
 * bbox from Overpass. Throws OverpassError (with an HTTP status) on failure.
 */
export async function fetchOverpassBuildings(bounds3857: Bounds3857): Promise<OverpassBuildings> {
  const area = bboxAreaKm2(bounds3857)
  if (area > MAX_BBOX_KM2)
    throw new OverpassError(
      `Live OSM data needs a smaller view (${area.toFixed(1)} km2, max ${MAX_BBOX_KM2} km2). Zoom in.`,
      400
    )

  const query = buildOverpassQuery(bounds3857)
  const now = Date.now()
  for (const [key, entry] of cache) if (now - entry.at > CACHE_TTL_MS) cache.delete(key)

  const hit = cache.get(query)
  if (hit) return hit.promise

  const promise = requestOverpass(query).then((data) =>
    parseOverpassElements(Array.isArray(data.elements) ? data.elements : [])
  )
  cache.set(query, { at: now, promise })
  // Never cache failures: the next click should retry.
  promise.catch(() => cache.delete(query))
  return promise
}
