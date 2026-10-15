import type { Feature } from 'geojson'
import { describe, expect, it } from 'vite-plus/test'
import { VERDIEPING_FIXME, filterFeatureProperties } from '~/utils/grbExportTags'

// Minimal square polygon — geometry is irrelevant to property filtering.
const GEOM: Feature['geometry'] = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
      [0, 0]
    ]
  ]
}

const feature = (properties: Record<string, any>): Feature => ({
  type: 'Feature',
  geometry: GEOM,
  properties
})

const tags = (properties: Record<string, any>) =>
  filterFeatureProperties(feature(properties)).properties as Record<string, any>

describe('filterFeatureProperties — building defaults & pre-filtering (#53)', () => {
  it('tags an ordinary GRB polygon as building=yes', () => {
    expect(tags({ oidn: 1, lbltype: 'hoofdgebouw' }).building).toBe('yes')
  })

  it('does NOT tag gbg-3 (virtual facade) as a building', () => {
    const out = tags({ oidn: 2, lbltype: 'gebouw afgezoomd met virtuele gevels' })
    expect(out.building).toBeUndefined()
  })

  it('does NOT tag "trap" as a building', () => {
    expect(tags({ oidn: 3, lbltype: 'trap' }).building).toBeUndefined()
  })

  it.each(['afdak', 'loopbrug', 'luifel', 'ingezonken garagetoegang', 'verheven garagetoegang'])(
    'does NOT tag other GBA type "%s" as a building',
    (lbltype) => {
      expect(tags({ oidn: 6, lbltype }).building).toBeUndefined()
      expect(tags({ oidn: 6, lbltype }).fixme).toBeUndefined()
    }
  )

  it('tags bijgebouw (gbg-2) as a building and reads type_label too', () => {
    expect(tags({ oidn: 7, type_label: 'bijgebouw' }).building).toBe('yes')
  })

  it('does not filter polygons without a type label (PICC/Urbis)', () => {
    expect(tags({ oidn: 8 }).building).toBe('yes')
  })

  it('keeps verdieping as a building and adds the required fixme', () => {
    const out = tags({ oidn: 4, lbltype: 'verdieping' })
    expect(out.building).toBe('yes')
    expect(out.fixme).toBe(VERDIEPING_FIXME)
  })

  it('is case-insensitive on the type label', () => {
    expect(tags({ oidn: 5, lbltype: 'VERDIEPING' }).fixme).toBe(VERDIEPING_FIXME)
  })
})

describe('filterFeatureProperties — source:geometry:date is date-only (#49)', () => {
  it('strips a T-separated time component', () => {
    expect(tags({ oidn: 1, survey_date: '2023-03-15T00:00:00' })['source:geometry:date']).toBe('2023-03-15')
  })

  it('strips a space-separated time component', () => {
    expect(tags({ oidn: 1, survey_date: '2023-03-15 12:34:56' })['source:geometry:date']).toBe('2023-03-15')
  })

  it('converts DD/MM/YYYY to YYYY-MM-DD', () => {
    expect(tags({ oidn: 1, opndatum: '5/3/2023' })['source:geometry:date']).toBe('2023-03-05')
  })

  it('passes through an already-correct date', () => {
    expect(tags({ oidn: 1, opndatum: '2023-03-15' })['source:geometry:date']).toBe('2023-03-15')
  })

  it('omits the date tag for unparseable input', () => {
    expect(tags({ oidn: 1, opndatum: 'unknown' })['source:geometry:date']).toBeUndefined()
  })
})

describe('filterFeatureProperties — PICC date_leve (#49)', () => {
  it('maps date_leve to a date-only source:geometry:date and strips raw PICC fields', () => {
    const out = tags({
      _layer_type: 'picc',
      objectid: 1,
      date_leve: '2021-06-30 00:00:00',
      date_modif: '2022-01-01',
      georef_id: 'x',
      natur_desc: 'Bâtiment'
    })
    expect(out['source:geometry:date']).toBe('2021-06-30')
    for (const removed of ['date_leve', 'date_modif', 'georef_id', 'natur_desc']) {
      expect(out).not.toHaveProperty(removed)
    }
  })

  it('prefers survey_date over date_leve', () => {
    expect(tags({ survey_date: '2020-01-02', date_leve: '2021-06-30' })['source:geometry:date']).toBe('2020-01-02')
  })
})

describe('filterFeatureProperties — source:geometry:ref', () => {
  it('builds the ref from entity + oidn for GRB', () => {
    expect(tags({ oidn: 12345, lbltype: 'hoofdgebouw' })['source:geometry:ref']).toBe('Gbg/12345')
  })

  it('uses the Knw entity for kunstwerken', () => {
    expect(tags({ oidn: 99, _layer_type: 'knw', type_code: '7' })['source:geometry:ref']).toBe('Knw/99')
  })
})

describe('filterFeatureProperties — KNW default tags (#22)', () => {
  it('maps type 7 to man_made=chimney and removes the building tag', () => {
    const out = tags({ oidn: 1, _layer_type: 'knw', type_code: '7' })
    expect(out.man_made).toBe('chimney')
    expect(out.building).toBeUndefined()
  })

  it('maps type 14 (wind turbine) to the generator tag set', () => {
    const out = tags({ oidn: 1, entity: 'Knw', type_code: '14' })
    expect(out.power).toBe('generator')
    expect(out['generator:source']).toBe('wind')
    expect(out['generator:method']).toBe('wind_turbine')
  })

  it('maps type 9 to silo by default', () => {
    expect(tags({ oidn: 1, _layer_type: 'knw', type_code: '9', type_label: 'silo' }).man_made).toBe('silo')
  })

  it('maps type 9 to storage_tank when the label is an opslagtank', () => {
    expect(tags({ oidn: 1, _layer_type: 'knw', type_code: '9', type_label: 'opslagtank' }).man_made).toBe(
      'storage_tank'
    )
  })

  it('leaves an out-of-scope KNW type untagged (no man_made, no building)', () => {
    const out = tags({ oidn: 1, _layer_type: 'knw', type_code: '3' })
    expect(out.man_made).toBeUndefined()
    expect(out.building).toBeUndefined()
  })
})

describe('filterFeatureProperties — addresses (#49)', () => {
  it('emits addr:* tags for a single-address building', () => {
    const out = tags({
      oidn: 1,
      lbltype: 'hoofdgebouw',
      address_count: 1,
      addresses: 'Kerkstraat 12',
      street_names: 'Kerkstraat',
      postcodes: '9000',
      municipalities: 'Gent'
    })
    expect(out['addr:street']).toBe('Kerkstraat')
    expect(out['addr:housenumber']).toBe('12')
    expect(out['addr:postcode']).toBe('9000')
    expect(out['addr:city']).toBe('Gent')
  })

  it('parses house numbers with letters and box suffixes', () => {
    const out = tags({
      oidn: 1,
      address_count: 1,
      addresses: 'Rue de la Gare 5A/3',
      street_names: 'Rue de la Gare'
    })
    expect(out['addr:housenumber']).toBe('5A/3')
  })

  it('does NOT emit addr:* tags for multi-address buildings', () => {
    const out = tags({
      oidn: 1,
      lbltype: 'hoofdgebouw',
      address_count: 2,
      addresses: 'Kerkstraat 12; Kerkstraat 14',
      street_names: 'Kerkstraat',
      postcodes: '9000',
      municipalities: 'Gent'
    })
    expect(out['addr:street']).toBeUndefined()
    expect(out['addr:housenumber']).toBeUndefined()
  })
})

describe('filterFeatureProperties — internal property stripping', () => {
  it('removes GRB/PICC/Urbis internal fields from the exported tags', () => {
    const out = tags({
      oidn: 1,
      lbltype: 'hoofdgebouw',
      type_code: 1,
      type_label: 'hoofdgebouw',
      address_count: 1,
      addresses: 'Kerkstraat 12',
      street_names: 'Kerkstraat',
      postcodes: '9000',
      municipalities: 'Gent',
      objectid: 7,
      natur_code: 1,
      building_id: 8,
      inspire_id: 9
    })
    for (const removed of [
      'oidn',
      'lbltype',
      'type_code',
      'type_label',
      'opndatum',
      'survey_date',
      'addresses',
      'street_names',
      'postcodes',
      'municipalities',
      'address_count',
      'objectid',
      'natur_code',
      'building_id',
      'inspire_id',
      'source:geometry:oidn',
      'source:geometry:entity'
    ]) {
      expect(out, `expected ${removed} to be stripped`).not.toHaveProperty(removed)
    }
    // ...but the derived OSM tags survive
    expect(out['source:geometry:ref']).toBe('Gbg/1')
    expect(out.building).toBe('yes')
  })

  it('does not mutate the input feature', () => {
    const input = feature({ oidn: 1, lbltype: 'hoofdgebouw' })
    filterFeatureProperties(input)
    expect(input.properties).toEqual({ oidn: 1, lbltype: 'hoofdgebouw' })
  })
})
