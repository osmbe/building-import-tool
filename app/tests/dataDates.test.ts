import { describe, expect, it } from 'vite-plus/test'
import { fetchDataDates } from '~/server/utils/dataDates'

describe('fetchDataDates', () => {
  it('returns ISO dates per source and shares the GRB date with KNW', async () => {
    const dates = await fetchDataDates(async (sql) => {
      if (sql.includes('grb.')) return [{ imported_at: new Date('2026-03-01T04:00:00Z') }]
      if (sql.includes('picc.')) return [{ imported_at: '2026-02-01T00:00:00Z' }]
      return [{ imported_at: null }]
    })
    expect(dates).toEqual({
      grb: '2026-03-01T04:00:00.000Z',
      knw: '2026-03-01T04:00:00.000Z',
      picc: '2026-02-01T00:00:00.000Z',
      urbis: null
    })
  })

  it('returns null for sources whose table is missing', async () => {
    const dates = await fetchDataDates(async () => {
      throw new Error('relation does not exist')
    })
    expect(dates).toEqual({ grb: null, knw: null, picc: null, urbis: null })
  })

  it('accepts epoch numbers and rejects unparseable or unexpected values', async () => {
    const dates = await fetchDataDates(async (sql) => {
      if (sql.includes('grb.')) return [{ imported_at: Date.UTC(2026, 0, 2) }]
      if (sql.includes('picc.')) return [{ imported_at: 'not a date' }]
      return [{ imported_at: true }]
    })
    expect(dates).toEqual({ grb: '2026-01-02T00:00:00.000Z', knw: '2026-01-02T00:00:00.000Z', picc: null, urbis: null })
  })
})
