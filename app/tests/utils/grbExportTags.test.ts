import { describe, expect, it } from 'vite-plus/test'
import { BUILDING_TYPE_LABELS, isBuildingTypeLabel } from '~/utils/grbExportTags'

describe('isBuildingTypeLabel (#53)', () => {
  it('accepts empty labels and the allow-list only, case- and space-insensitively', () => {
    expect(BUILDING_TYPE_LABELS).toEqual(['hoofdgebouw', 'bijgebouw', 'verdieping'])
    expect(isBuildingTypeLabel('')).toBe(true)
    expect(isBuildingTypeLabel(' Verdieping ')).toBe(true)
    expect(isBuildingTypeLabel('HOOFDGEBOUW')).toBe(true)
    expect(isBuildingTypeLabel('gebouw afgezoomd met virtuele gevels')).toBe(false)
    expect(isBuildingTypeLabel('trap')).toBe(false)
  })
})
