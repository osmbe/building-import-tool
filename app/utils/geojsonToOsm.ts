import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'

/**
 * Convert a GeoJSON FeatureCollection to OSM XML string.
 * Replacement for the unmaintained `geojsontoosm` npm package.
 * Supports Point, LineString, Polygon, MultiPolygon geometry types.
 */
export function geojsonToOsm(geojson: FeatureCollection): string {
  const features = geojson.features || []
  const nodes: Node[] = []
  const nodesIndex = new Map<string, Node>()
  const ways: Way[] = []
  const relations: Relation[] = []

  for (const feature of features) {
    const properties = feature.properties || {}
    const geometry = feature.geometry
    if (!geometry) continue

    switch (geometry.type) {
      case 'Point':
        processPoint(geometry.coordinates, properties, nodes, nodesIndex)
        break
      case 'LineString':
        processLineString(geometry.coordinates, properties, ways, nodes, nodesIndex)
        break
      case 'Polygon':
        processMultiPolygon([geometry.coordinates], properties, relations, ways, nodes, nodesIndex)
        break
      case 'MultiPolygon':
        processMultiPolygon(geometry.coordinates, properties, relations, ways, nodes, nodesIndex)
        break
    }
  }

  // Assign negative IDs (new OSM objects convention)
  let nodeId = -1
  let wayId = -1
  let relationId = -1

  for (const node of nodes) node.id = nodeId--
  for (const way of ways) way.id = wayId--
  for (const rel of relations) rel.id = relationId--

  // Build XML
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="be2osm">']

  for (const node of nodes) {
    const tags = tagsXml(node.tags)
    if (tags) {
      lines.push(`  <node id="${node.id}" lat="${node.lat}" lon="${node.lon}">`)
      lines.push(tags)
      lines.push('  </node>')
    } else {
      lines.push(`  <node id="${node.id}" lat="${node.lat}" lon="${node.lon}"/>`)
    }
  }

  for (const way of ways) {
    lines.push(`  <way id="${way.id}">`)
    for (const nd of way.nodes) {
      lines.push(`    <nd ref="${nd.id}"/>`)
    }
    const wayTags = tagsXml(way.tags)
    if (wayTags) lines.push(wayTags)
    lines.push('  </way>')
  }

  for (const rel of relations) {
    lines.push(`  <relation id="${rel.id}">`)
    for (const member of rel.members) {
      lines.push(`    <member type="${member.type}" ref="${member.elem.id}" role="${member.role}"/>`)
    }
    const relTags = tagsXml(rel.tags)
    if (relTags) lines.push(relTags)
    lines.push('  </relation>')
  }

  lines.push('</osm>')
  return lines.join('\n')
}

// --- Internal types ---

interface Node {
  id: number
  lat: number
  lon: number
  tags: Record<string, string>
}

interface Way {
  id: number
  nodes: Node[]
  tags: Record<string, string>
}

interface Relation {
  id: number
  members: { type: string; elem: Way; role: string }[]
  tags: Record<string, string>
}

// --- Helpers ---

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function tagsXml(tags: Record<string, string>): string {
  const entries = Object.entries(tags)
  if (entries.length === 0) return ''
  return entries
    .map(([k, v]) => `    <tag k="${escapeXml(k)}" v="${escapeXml(v)}"/>`)
    .join('\n')
}

function coordHash(coords: Position): string {
  return `${coords[0]},${coords[1]}`
}

function getOrCreateNode(
  coords: Position,
  nodes: Node[],
  nodesIndex: Map<string, Node>,
): Node {
  const hash = coordHash(coords)
  let node = nodesIndex.get(hash)
  if (!node) {
    node = { id: 0, lat: coords[1], lon: coords[0], tags: {} }
    nodes.push(node)
    nodesIndex.set(hash, node)
  }
  return node
}

function processPoint(
  coords: Position,
  properties: Record<string, any>,
  nodes: Node[],
  nodesIndex: Map<string, Node>,
): void {
  const node = getOrCreateNode(coords, nodes, nodesIndex)
  Object.assign(node.tags, properties)
}

function processLineString(
  coords: Position[],
  properties: Record<string, any>,
  ways: Way[],
  nodes: Node[],
  nodesIndex: Map<string, Node>,
): void {
  const way: Way = { id: 0, tags: { ...properties }, nodes: [] }
  ways.push(way)
  for (const point of coords) {
    way.nodes.push(getOrCreateNode(point, nodes, nodesIndex))
  }
}

function processMultiPolygon(
  coordinates: Position[][][],
  properties: Record<string, any>,
  relations: Relation[],
  ways: Way[],
  nodes: Node[],
  nodesIndex: Map<string, Node>,
): void {
  // Simple polygon with single outer ring → closed way
  if (coordinates.length === 1 && coordinates[0].length === 1) {
    return processLineString(coordinates[0][0], properties, ways, nodes, nodesIndex)
  }

  // Multipolygon relation
  const relation: Relation = {
    id: 0,
    tags: { ...properties, type: 'multipolygon' },
    members: [],
  }
  relations.push(relation)

  for (const polygon of coordinates) {
    for (let i = 0; i < polygon.length; i++) {
      const ring = polygon[i]
      const way: Way = { id: 0, tags: {}, nodes: [] }
      ways.push(way)
      relation.members.push({
        elem: way,
        type: 'way',
        role: i === 0 ? 'outer' : 'inner',
      })
      for (const point of ring) {
        way.nodes.push(getOrCreateNode(point, nodes, nodesIndex))
      }
    }
  }
}
