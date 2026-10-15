// Overpass API helper (issue #9): source OSM buildings live for the current bbox,
// as an opt-in alternative to the daily-refreshed Postgres mirror. This lets the
// difference tool reflect very recent OSM edits without waiting for the next import.

import { parseOsmSourceOidns } from '../../utils/osmSourceOidn'

const OVERPASS_ENDPOINT = process.env.OVERPASS_API_URL || 'https://overpass-api.de/api/interpreter'
const MERCATOR_R = 20037508.342789244

/** Convert a Web Mercator (EPSG:3857) coordinate to WGS84 lon/lat. */
export function mercatorToLonLat(x: number, y: number): [number, number] {
  const lon = (x / MERCATOR_R) * 180
  let lat = (y / MERCATOR_R) * 180
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2)
  return [lon, lat]
}

export interface OverpassBuildings {
  /** GeoJSON GeometryCollection (EPSG:4326) of building footprints, or null if none. */
  geomCollection: string | null
  /** Number of building footprints returned. */
  totalOsm: number
  /** GRB OIDN references found in OSM tags (source:geometry:oidn / source:geometry:ref). */
  oidnList: string[]
}

/**
 * Fetch OSM building footprints in the given Web Mercator bbox from Overpass.
 * Only closed ways tagged building=* are used (multipolygon relations are skipped in this v1).
 */
export async function fetchOverpassBuildings(bounds3857: [number, number, number, number]): Promise<OverpassBuildings> {
  const [minX, minY, maxX, maxY] = bounds3857
  const [west, south] = mercatorToLonLat(minX, minY)
  const [east, north] = mercatorToLonLat(maxX, maxY)

  // bbox order for Overpass is (south, west, north, east)
  const bbox = `${south},${west},${north},${east}`
  const query = `[out:json][timeout:25];(way["building"](${bbox}););out geom tags;`

  const response = await fetch(OVERPASS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Overpass request failed (${response.status}): ${text.slice(0, 200)}`)
  }

  const data = (await response.json()) as { elements?: any[] }
  const elements = Array.isArray(data.elements) ? data.elements : []

  const geometries: Array<{ type: 'Polygon'; coordinates: number[][][] }> = []
  const oidnSet = new Set<string>()

  for (const el of elements) {
    if (el.type !== 'way' || !Array.isArray(el.geometry)) continue

    // Build a closed linear ring from the node list
    const ring: [number, number][] = el.geometry
      .filter((n: any) => n && typeof n.lon === 'number' && typeof n.lat === 'number')
      .map((n: any): [number, number] => [n.lon, n.lat])

    const first = ring[0]
    const last = ring.at(-1)
    if (ring.length < 3 || !first || !last) continue
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
    if (ring.length < 4) continue

    geometries.push({ type: 'Polygon', coordinates: [ring] })

    // Collect GRB references for source-tag matching
    const tags = el.tags || {}
    for (const id of parseOsmSourceOidns({ oidn: tags['source:geometry:oidn'], ref: tags['source:geometry:ref'] })) {
      oidnSet.add(id)
    }
  }

  const geomCollection = geometries.length > 0 ? JSON.stringify({ type: 'GeometryCollection', geometries }) : null

  return {
    geomCollection,
    totalOsm: geometries.length,
    oidnList: Array.from(oidnSet)
  }
}
