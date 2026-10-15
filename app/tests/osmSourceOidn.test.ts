import { describe, expect, it } from 'vite-plus/test'
import { collectOsmSourceOidns, parseOidnValues, parseOsmSourceOidns } from '~/utils/osmSourceOidn'

describe('parseOsmSourceOidns', () => {
  it('parses a plain source:geometry:oidn', () => {
    expect(parseOsmSourceOidns({ oidn: '1371282' })).toEqual(['1371282'])
  })

  it('parses a single Entity/OIDN ref', () => {
    expect(parseOsmSourceOidns({ ref: 'Gbg/1371282' })).toEqual(['1371282'])
  })

  it('parses ;-separated refs (merged buildings)', () => {
    expect(parseOsmSourceOidns({ ref: 'Gbg/1422118;Gbg/1422195' })).toEqual(['1422118', '1422195'])
    expect(parseOsmSourceOidns({ ref: 'Gba/2664;Gbg/58610' })).toEqual(['2664', '58610'])
  })

  it('combines oidn and ref without duplicates', () => {
    expect(parseOsmSourceOidns({ oidn: '5', ref: 'Gbg/5;Gbg/6' })).toEqual(['5', '6'])
  })

  it('accepts entity prefixes and multiple values in the oidn tag', () => {
    expect(parseOsmSourceOidns({ oidn: 'Gbg/12; 13' })).toEqual(['12', '13'])
  })

  it('trims whitespace and strips leading zeros', () => {
    expect(parseOidnValues('  Gbg/ 0012 ; ')).toEqual(['12'])
    expect(parseOidnValues('0')).toEqual(['0'])
  })

  it('ignores empty and non-numeric values', () => {
    expect(parseOsmSourceOidns({ oidn: '', ref: null })).toEqual([])
    expect(parseOsmSourceOidns({ ref: 'Gbg/' })).toEqual([])
    expect(parseOsmSourceOidns({ ref: 'Gbg/abc' })).toEqual([])
    expect(parseOsmSourceOidns({})).toEqual([])
  })
})

describe('collectOsmSourceOidns', () => {
  it('dedupes across objects', () => {
    expect(collectOsmSourceOidns([{ ref: 'Gbg/1;Gbg/2' }, { oidn: '2' }, { ref: 'Gbg/3' }]).sort()).toEqual([
      '1',
      '2',
      '3'
    ])
  })
})
