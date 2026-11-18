import type { CandidateProperties } from './candidates'

const KNW_TAG_MAP_BY_CODE: Record<string, Record<string, string>> = {
  // Overbrugging outlines are bridge areas; bridge=yes belongs on the crossing way, not the outline.
  '1': { man_made: 'bridge' },
  '5': { man_made: 'bridge_support' },
  '7': { man_made: 'chimney' },
  '8': { man_made: 'cooling_tower' },
  '11': { man_made: 'water_tower' },
  '14': {
    'generator:method': 'wind_turbine',
    'generator:source': 'wind',
    power: 'generator'
  },
  '22': { man_made: 'breakwater' },
  '23': { man_made: 'breakwater' },
  '24': { man_made: 'pier' }
}

export function tags(props: CandidateProperties): Record<string, string> {
  const code = String(props.type_code ?? '').trim()
  const label = String(props.type_label ?? '')
    .toLowerCase()
    .trim()

  if (code === '9')
    return { man_made: label.includes('opslagtank') && !label.includes('silo') ? 'storage_tank' : 'silo' }

  return { ...KNW_TAG_MAP_BY_CODE[code] }
}
