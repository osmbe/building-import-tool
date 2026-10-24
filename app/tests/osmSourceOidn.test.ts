import { describe, expect, it } from 'vite-plus/test'
import { collectOsmSourceRefs, parseOsmSourceRefs, parseRefValues } from '~/utils/osmSourceOidn'

describe('parseOsmSourceRefs', () => {
  it('parses a plain source:geometry:oidn as a GBG reference', () => {
    expect(parseOsmSourceRefs({ oidn: '1371282' })).toEqual(['Gbg/1371282'])
  })

  it('uses source:geometry:entity for an unprefixed oidn', () => {
    expect(parseOsmSourceRefs({ entity: 'Gba', oidn: '2664' })).toEqual(['Gba/2664'])
    expect(parseOsmSourceRefs({ entity: ' gba ', oidn: '2664' })).toEqual(['Gba/2664'])
    expect(parseOsmSourceRefs({ entity: 'unknown', oidn: '2664' })).toEqual(['Gbg/2664'])
  })

  it('parses a single Entity/OIDN ref', () => {
    expect(parseOsmSourceRefs({ ref: 'Gbg/1371282' })).toEqual(['Gbg/1371282'])
  })

  it('parses ;-separated refs (merged buildings) and keeps their entities apart', () => {
    expect(parseOsmSourceRefs({ ref: 'Gbg/1422118;Gbg/1422195' })).toEqual(['Gbg/1422118', 'Gbg/1422195'])
    expect(parseOsmSourceRefs({ ref: 'Gba/2664;Gbg/58610' })).toEqual(['Gba/2664', 'Gbg/58610'])
  })

  it('normalises entity case', () => {
    expect(parseOsmSourceRefs({ ref: 'GBG/5;gba/6' })).toEqual(['Gbg/5', 'Gba/6'])
  })

  it('combines oidn and ref without duplicates', () => {
    expect(parseOsmSourceRefs({ oidn: '5', ref: 'Gbg/5;Gbg/6' })).toEqual(['Gbg/5', 'Gbg/6'])
  })

  it('accepts entity prefixes and multiple values in the oidn tag', () => {
    expect(parseOsmSourceRefs({ oidn: 'Gbg/12; 13' })).toEqual(['Gbg/12', 'Gbg/13'])
  })

  it('trims whitespace and strips leading zeros', () => {
    expect(parseRefValues('  Gbg/ 0012 ; ')).toEqual(['Gbg/12'])
    expect(parseRefValues('0')).toEqual(['Gbg/0'])
  })

  it('ignores empty, non-numeric and non-GRB values', () => {
    expect(parseOsmSourceRefs({ oidn: '', ref: null })).toEqual([])
    expect(parseOsmSourceRefs({ ref: 'Gbg/' })).toEqual([])
    expect(parseOsmSourceRefs({ ref: 'Gbg/abc' })).toEqual([])
    expect(parseOsmSourceRefs({ ref: 'Picc/123' })).toEqual([])
    expect(parseOsmSourceRefs({})).toEqual([])
  })
})

describe('collectOsmSourceRefs', () => {
  it('dedupes across objects', () => {
    expect(collectOsmSourceRefs([{ ref: 'Gbg/1;Gbg/2' }, { oidn: '2' }, { ref: 'Gbg/3' }]).sort()).toEqual([
      'Gbg/1',
      'Gbg/2',
      'Gbg/3'
    ])
  })

  it('does not merge the same number across entities', () => {
    expect(collectOsmSourceRefs([{ ref: 'Gba/2664' }, { ref: 'Gbg/2664' }]).sort()).toEqual(['Gba/2664', 'Gbg/2664'])
  })
})
