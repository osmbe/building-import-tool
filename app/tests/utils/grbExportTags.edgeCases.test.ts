import type { Feature } from 'geojson'
import { describe, expect, it } from 'vite-plus/test'
import { filterFeatureProperties, grbEntityForTypeLabel, isBuildingTypeLabel } from '~/utils/grbExportTags'

const tags = (properties: Record<string, any> | null) =>
  filterFeatureProperties({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [4, 51] },
    properties
  } as Feature).properties as Record<string, any>

describe('grbEntityForTypeLabel', () => {
  it('treats missing labels as GBG', () => {
    expect(grbEntityForTypeLabel(null)).toBe('Gbg')
    expect(grbEntityForTypeLabel(undefined)).toBe('Gbg')
    expect(grbEntityForTypeLabel('  ')).toBe('Gbg')
  })

  it('recognises the three GBG labels case-insensitively, everything else is GBA', () => {
    expect(grbEntityForTypeLabel(' Gebouw afgezoomd met virtuele gevels ')).toBe('Gbg')
    expect(grbEntityForTypeLabel('HOOFDGEBOUW')).toBe('Gbg')
    expect(grbEntityForTypeLabel('afdak')).toBe('Gba')
  })
})

describe('isBuildingTypeLabel', () => {
  it('accepts empty labels and the allow-list only', () => {
    expect(isBuildingTypeLabel('')).toBe(true)
    expect(isBuildingTypeLabel(' Verdieping ')).toBe(true)
    expect(isBuildingTypeLabel('gebouw afgezoomd met virtuele gevels')).toBe(false)
    expect(isBuildingTypeLabel('trap')).toBe(false)
  })
})

describe('filterFeatureProperties — edge cases', () => {
  it('handles a feature without properties', () => {
    const out = tags(null)
    expect(out.building).toBe('yes')
    expect(out['source:geometry:ref']).toBeUndefined()
  })

  it('does not copy the input properties object', () => {
    const input = { oidn: 5 }
    expect(tags(input)).not.toBe(input)
  })

  it('keeps an explicit building value', () => {
    expect(tags({ building: 'house', auto_building: 'garage' }).building).toBe('house')
  })

  it('adds no structure tags for a KNW object without a type code', () => {
    const out = tags({ oidn: 3, _layer_type: 'knw' })
    expect(out.man_made).toBeUndefined()
    expect(out.power).toBeUndefined()
    expect(out.building).toBeUndefined()
    expect(out['source:geometry:ref']).toBe('Knw/3')
  })

  it('does not override existing structure tags on KNW objects', () => {
    expect(tags({ _layer_type: 'knw', type_code: '7', man_made: 'mast' }).man_made).toBe('mast')
  })

  it('recognises KNW via the entity property as well', () => {
    expect(tags({ oidn: 1, entity: 'kunstwerken', type_code: '24' }).man_made).toBe('pier')
    expect(tags({ oidn: 1, source_geometry_entity: 'KNW', type_code: '11' }).man_made).toBe('water_tower')
  })

  it('distinguishes storage tanks from silos (type 9)', () => {
    expect(tags({ _layer_type: 'knw', type_code: '9', type_label: 'Opslagtank' }).man_made).toBe('storage_tank')
    expect(tags({ _layer_type: 'knw', type_code: '9', lbltype: 'silo, opslagtank' }).man_made).toBe('silo')
    expect(tags({ _layer_type: 'knw', type_code: '9' }).man_made).toBe('silo')
  })

  it('ignores malformed survey dates', () => {
    expect(tags({ opndatum: '03/2023' })['source:geometry:date']).toBeUndefined()
    expect(tags({ opndatum: 'March 2023' })['source:geometry:date']).toBeUndefined()
    expect(tags({ opndatum: '2023-3-5' })['source:geometry:date']).toBeUndefined()
  })

  it('pads single-digit day and month in DD/MM/YYYY dates', () => {
    expect(tags({ opndatum: '5/3/2023' })['source:geometry:date']).toBe('2023-03-05')
    expect(tags({ survey_date: '2023-03-15 00:00:00' })['source:geometry:date']).toBe('2023-03-15')
  })
})

describe('filterFeatureProperties — address edge cases (#49)', () => {
  const single = (extra: Record<string, unknown>) => tags({ oidn: 1, address_count: 1, ...extra })

  it('emits no house number when the address does not start with the street name', () => {
    const out = single({ addresses: 'Dorpsplein 12', street_names: 'Kerkstraat', postcodes: '9000' })
    expect(out['addr:street']).toBe('Kerkstraat')
    expect(out['addr:housenumber']).toBeUndefined()
    expect(out['addr:postcode']).toBe('9000')
  })

  it('emits no house number when none can be parsed', () => {
    const out = single({ addresses: 'Kerkstraat zn', street_names: 'Kerkstraat' })
    expect(out['addr:street']).toBe('Kerkstraat')
    expect(out['addr:housenumber']).toBeUndefined()
  })

  it('takes the first entry of aggregated lists and tolerates missing ones', () => {
    const out = single({
      addresses: '7',
      street_names: null,
      postcodes: '9000, 9050',
      municipalities: 'Gent, Gentbrugge'
    })
    expect(out['addr:street']).toBeUndefined()
    expect(out['addr:housenumber']).toBe('7')
    expect(out['addr:postcode']).toBe('9000')
    expect(out['addr:city']).toBe('Gent')
  })

  it('never overwrites existing addr:* tags', () => {
    const out = single({
      addresses: 'Kerkstraat 12',
      street_names: 'Kerkstraat',
      postcodes: '9000',
      municipalities: 'Gent',
      'addr:street': 'Veldstraat',
      'addr:housenumber': '1',
      'addr:postcode': '1000',
      'addr:city': 'Brussel'
    })
    expect(out).toMatchObject({
      'addr:street': 'Veldstraat',
      'addr:housenumber': '1',
      'addr:postcode': '1000',
      'addr:city': 'Brussel'
    })
  })

  it('emits no address for KNW objects or when the address string is empty', () => {
    expect(
      tags({ _layer_type: 'knw', address_count: 1, addresses: 'Kerkstraat 1', street_names: 'Kerkstraat' })
    ).not.toHaveProperty('addr:street')
    expect(single({ addresses: '  ', street_names: 'Kerkstraat' })).not.toHaveProperty('addr:street')
  })
})

describe('filterFeatureProperties — regressions', () => {
  const single = (props: Record<string, any>) => tags({ address_count: 1, ...props })

  it('does not take the first letter of the next word as a house-number suffix', () => {
    expect(single({ addresses: '12 Main Street', street_names: 'Kerkstraat' })['addr:housenumber']).toBe('12')
    expect(single({ addresses: 'Kerkstraat 12 b', street_names: 'Kerkstraat' })['addr:housenumber']).toBe('12b')
  })

  it('uses auto_building for building candidates only', () => {
    expect(tags({ auto_building: 'garage' }).building).toBe('garage')
    expect(tags({ auto_building: 'garage', lbltype: 'trap' })).not.toHaveProperty('building')
    expect(tags({ auto_building: 'garage', _layer_type: 'knw', type_code: '7' })).not.toHaveProperty('building')
    expect(tags({ auto_building: 'garage' })).not.toHaveProperty('auto_building')
  })
})
