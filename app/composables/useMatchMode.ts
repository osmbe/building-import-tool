import { ref } from 'vue'

/**
 * Match mode for comparing GRB and OSM buildings
 * - 'geometry': Match based on spatial intersection
 * - 'source': Match based on source:geometry:oidn tag in OSM buildings (default)
 */
export type MatchMode = 'geometry' | 'source'

const matchMode = ref<MatchMode>('source')

export function useMatchMode() {
  const setMatchMode = (mode: MatchMode) => {
    matchMode.value = mode
  }

  const toggleMatchMode = () => {
    matchMode.value = matchMode.value === 'geometry' ? 'source' : 'geometry'
  }

  return {
    matchMode,
    setMatchMode,
    toggleMatchMode
  }
}
