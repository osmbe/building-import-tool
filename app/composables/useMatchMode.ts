import { ref } from 'vue'

/**
 * Match mode for comparing GRB and OSM buildings
 * - 'geometry': Match based on spatial intersection
 * - 'source': Match based on source:geometry:oidn tag in OSM buildings (GRB only)
 * - 'both': Candidate only if it is BOTH spatially unmatched AND missing the source tag (GRB only)
 */
export type MatchMode = 'geometry' | 'source' | 'both'

const matchMode = ref<MatchMode>('geometry')
const geometryThreshold = ref(0.7)
// Issue #9: opt-in to sourcing OSM buildings live from Overpass instead of the daily Postgres mirror.
const useOverpass = ref(false)

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

  const setUseOverpass = (value: boolean) => {
    useOverpass.value = value
  }

  return {
    matchMode,
    geometryThreshold,
    useOverpass,
    setMatchMode,
    setGeometryThreshold,
    setUseOverpass,
    toggleMatchMode
  }
}
