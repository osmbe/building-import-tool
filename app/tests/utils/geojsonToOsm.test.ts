import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { describe, expect, it } from 'vite-plus/test'
import { geojsonToOsm } from '~/utils/geojsonToOsm'

const collection = (...features: Feature[]): FeatureCollection => ({ features, type: 'FeatureCollection' })

const feature = (geometry: Geometry | null, properties: Record<string, unknown> | null = {}): Feature =>
  ({ geometry, properties, type: 'Feature' }) as Feature

// Small XML helpers: the output is line-based, one element per line.
const lines = (xml: string) => xml.split('\n')
const nodeLines = (xml: string) => lines(xml).filter((l) => l.trim().startsWith('<node '))
const ndRefs = (xml: string) => [...xml.matchAll(/<nd ref="(-?\d+)"\/>/g)].map((m) => Number(m[1]))
const members = (xml: string) =>
  [...xml.matchAll(/<member type="(\w+)" ref="(-?\d+)" role="(\w+)"\/>/g)].map((m) => ({
    ref: Number(m[2]),
    role: m[3],
    type: m[1]
  }))

const square = (x: number, y: number, size = 1): number[][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
  [x, y]
]

describe('geojsonToOsm — document', () => {
  it('produces an empty OSM document for an empty collection', () => {
    expect(geojsonToOsm(collection())).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="be2osm">\n</osm>'
    )
  })

  it('tolerates a collection without a features array', () => {
    const xml = geojsonToOsm({ type: 'FeatureCollection' } as unknown as FeatureCollection)
    expect(xml).toContain('<osm version="0.6" generator="be2osm">')
    expect(xml).not.toContain('<node')
  })

  it('skips features without geometry and unsupported geometry types', () => {
    const xml = geojsonToOsm(
      collection(
        feature(null, { building: 'yes' }),
        feature({
          coordinates: [
            [4, 51],
            [5, 52]
          ],
          type: 'MultiPoint'
        })
      )
    )
    expect(xml).not.toMatch(/<(node|way|relation) /)
  })
})

describe('geojsonToOsm — Point', () => {
  it('writes a tagged node with negative id, lat and lon', () => {
    const xml = geojsonToOsm(collection(feature({ coordinates: [4.4, 51.2], type: 'Point' }, { amenity: 'bench' })))
    expect(xml).toContain('  <node id="-1" lat="51.2" lon="4.4">\n    <tag k="amenity" v="bench"/>\n  </node>')
  })

  it('writes an untagged node as a self-closing element (null properties)', () => {
    const xml = geojsonToOsm(collection(feature({ coordinates: [4.4, 51.2], type: 'Point' }, null)))
    expect(nodeLines(xml)).toEqual(['  <node id="-1" lat="51.2" lon="4.4"/>'])
  })

  it('merges the tags of points at the same position into one node', () => {
    const xml = geojsonToOsm(
      collection(
        feature({ coordinates: [4, 51], type: 'Point' }, { a: '1' }),
        feature({ coordinates: [4, 51], type: 'Point' }, { b: '2' })
      )
    )
    expect(nodeLines(xml)).toHaveLength(1)
    expect(xml).toContain('<tag k="a" v="1"/>')
    expect(xml).toContain('<tag k="b" v="2"/>')
  })

  it('escapes XML special characters in keys and values', () => {
    const xml = geojsonToOsm(
      collection(feature({ coordinates: [4, 51], type: 'Point' }, { 'a&b': 'Tom & "Jerry" <3>' }))
    )
    expect(xml).toContain('<tag k="a&amp;b" v="Tom &amp; &quot;Jerry&quot; &lt;3&gt;"/>')
  })

  it('stringifies non-string tag values', () => {
    const xml = geojsonToOsm(collection(feature({ coordinates: [4, 51], type: 'Point' }, { level: 2 })))
    expect(xml).toContain('<tag k="level" v="2"/>')
  })

  it('rejects positions without a latitude', () => {
    expect(() => geojsonToOsm(collection(feature({ coordinates: [4], type: 'Point' })))).toThrow(
      'Invalid GeoJSON position: [4]'
    )
  })
})

describe('geojsonToOsm — LineString', () => {
  it('writes a tagged way referencing its nodes in order', () => {
    const xml = geojsonToOsm(
      collection(
        feature(
          {
            coordinates: [
              [4, 51],
              [4.1, 51],
              [4.2, 51.1]
            ],
            type: 'LineString'
          },
          { highway: 'footway' }
        )
      )
    )
    expect(nodeLines(xml)).toHaveLength(3)
    expect(xml).toContain('  <way id="-1">')
    expect(ndRefs(xml)).toEqual([-1, -2, -3])
    expect(xml).toContain('<tag k="highway" v="footway"/>')
  })

  it('omits the tag block for an untagged way', () => {
    const xml = geojsonToOsm(
      collection(
        feature({
          coordinates: [
            [4, 51],
            [5, 51]
          ],
          type: 'LineString'
        })
      )
    )
    expect(xml).toContain('  <way id="-1">\n    <nd ref="-1"/>\n    <nd ref="-2"/>\n  </way>')
  })
})

describe('geojsonToOsm — Polygon', () => {
  it('writes a simple polygon as a closed way (first and last node are the same)', () => {
    const xml = geojsonToOsm(
      collection(feature({ coordinates: [square(4, 51)], type: 'Polygon' }, { building: 'yes' }))
    )
    // 5 positions, but the closing position reuses the first node
    expect(nodeLines(xml)).toHaveLength(4)
    expect(ndRefs(xml)).toEqual([-1, -2, -3, -4, -1])
    expect(xml).toContain('<tag k="building" v="yes"/>')
    expect(xml).not.toContain('<relation')
  })

  it('shares nodes between adjacent buildings', () => {
    const xml = geojsonToOsm(
      collection(
        feature({ coordinates: [square(0, 0)], type: 'Polygon' }, { building: 'yes' }),
        feature({ coordinates: [square(1, 0)], type: 'Polygon' }, { building: 'yes' })
      )
    )
    // Two squares sharing an edge: 4 + 4 - 2 shared corners
    expect(nodeLines(xml)).toHaveLength(6)
    expect(lines(xml).filter((l) => l.startsWith('  <way '))).toEqual(['  <way id="-1">', '  <way id="-2">'])
  })

  it('writes a polygon with a hole as a multipolygon relation (outer + inner)', () => {
    const xml = geojsonToOsm(
      collection(feature({ coordinates: [square(0, 0, 10), square(2, 2, 2)], type: 'Polygon' }, { building: 'yes' }))
    )
    expect(members(xml)).toEqual([
      { ref: -1, role: 'outer', type: 'way' },
      { ref: -2, role: 'inner', type: 'way' }
    ])
    const relation = xml.slice(xml.indexOf('<relation'))
    expect(relation).toContain('<tag k="building" v="yes"/>')
    expect(relation).toContain('<tag k="type" v="multipolygon"/>')
    // The member ways themselves are untagged (tags live on the relation)
    const firstWay = xml.slice(xml.indexOf('<way id="-1">'), xml.indexOf('</way>'))
    expect(firstWay).not.toContain('<tag')
  })
})

describe('geojsonToOsm — MultiPolygon', () => {
  it('writes every ring of every polygon as a relation member', () => {
    const xml = geojsonToOsm(
      collection(
        feature(
          {
            coordinates: [[square(0, 0, 10), square(2, 2, 2)], [square(20, 0)]],
            type: 'MultiPolygon'
          },
          { building: 'yes' }
        )
      )
    )
    expect(xml).toContain('  <relation id="-1">')
    expect(members(xml)).toEqual([
      { ref: -1, role: 'outer', type: 'way' },
      { ref: -2, role: 'inner', type: 'way' },
      { ref: -3, role: 'outer', type: 'way' }
    ])
  })

  it('writes a single-polygon MultiPolygon as a closed way', () => {
    const xml = geojsonToOsm(collection(feature({ coordinates: [[square(0, 0)]], type: 'MultiPolygon' })))
    expect(xml).not.toContain('<relation')
    expect(ndRefs(xml)).toEqual([-1, -2, -3, -4, -1])
  })

  it('numbers relations independently of ways and nodes', () => {
    const xml = geojsonToOsm(
      collection(
        feature({ coordinates: [[square(0, 0)], [square(5, 0)]], type: 'MultiPolygon' }),
        feature({ coordinates: [[square(10, 0)], [square(15, 0)]], type: 'MultiPolygon' })
      )
    )
    expect(lines(xml).filter((l) => l.startsWith('  <relation '))).toEqual([
      '  <relation id="-1">',
      '  <relation id="-2">'
    ])
    expect(members(xml).map((m) => m.ref)).toEqual([-1, -2, -3, -4])
  })
})

describe('geojsonToOsm — empty tag values', () => {
  it('skips null, undefined and empty values instead of writing v="null"', () => {
    const xml = geojsonToOsm(
      collection(
        feature(
          { coordinates: [square(4, 51)], type: 'Polygon' },
          { building: 'yes', name: undefined, note: null, ref: '' }
        )
      )
    )
    expect(xml).toContain('<tag k="building" v="yes"/>')
    expect(xml).not.toContain('v="null"')
    expect(xml).not.toContain('k="name"')
    expect(xml).not.toContain('k="ref"')
  })
})
