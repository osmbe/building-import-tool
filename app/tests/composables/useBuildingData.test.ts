import { describe, expect, it } from 'vite-plus/test'
import { mockBuildingData } from '~/composables/useBuildingData'

describe('mockBuildingData', () => {
  it('has unique ids and valid building types', () => {
    const ids = mockBuildingData.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const b of mockBuildingData) {
      expect(['candidate', 'osm', 'conflict']).toContain(b.type)
    }
  })

  it('places every building in Belgium as [lon, lat]', () => {
    for (const { coordinates } of mockBuildingData) {
      const [lon, lat] = coordinates
      expect(lon).toBeGreaterThan(2.5)
      expect(lon).toBeLessThan(6.5)
      expect(lat).toBeGreaterThan(49.4)
      expect(lat).toBeLessThan(51.6)
    }
  })
})
