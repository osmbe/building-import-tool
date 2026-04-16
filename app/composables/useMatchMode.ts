import { ref } from 'vue'

/**
 * Match mode for comparing GRB and OSM buildings
 * - 'geometry': Match based on spatial intersection
 * - 'source': Match based on source:geometry:oidn tag in OSM buildings (GRB only)
 */
export type MatchMode = 'geometry' | 'source'

const matchMode = ref<MatchMode>('geometry')
const geometryThreshold = ref(0.7)

export function useMatchMode() {
  const setMatchMode = (mode: MatchMode) => {
    matchMode.value = mode
  }

  const toggleMatchMode = () => {
    matchMode.value = matchMode.value === 'geometry' ? 'source' : 'geometry'
  }

  const setGeometryThreshold = (value: number) => {
    if (Number.isNaN(value)) return
    geometryThreshold.value = Math.min(0.95, Math.max(0.3, value))
  }

  return {
    matchMode,
    geometryThreshold,
    setMatchMode,
    setGeometryThreshold,
    toggleMatchMode
  }
}
