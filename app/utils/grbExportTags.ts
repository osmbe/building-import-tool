// GRB tagging rules shared by the difference API (building type pre-filter) and the export
// (utils/candidates.ts, candidateTags).

// GRB polygon type labels (LBLTYPE) that may be exported as a building (issue #53). Allow-list:
// - GBG: only gbg-1 "hoofdgebouw" and gbg-2 "bijgebouw" (NOT gbg-3 "gebouw afgezoomd met virtuele gevels").
// - GBA: only gba-1 "verdieping" (exported with a fixme). Every other GBA type (trap, afdak, ...) is excluded.
// Unlabelled GRB polygons stay. The list applies to GRB only: other sources have their own type labels.
export const BUILDING_TYPE_LABELS = ['hoofdgebouw', 'bijgebouw', 'verdieping'] as const

const BUILDING_TYPE_LABEL_SET: ReadonlySet<string> = new Set(BUILDING_TYPE_LABELS)

export const isBuildingTypeLabel = (label: string): boolean => {
  const normalized = label.toLowerCase().trim()
  return normalized === '' || BUILDING_TYPE_LABEL_SET.has(normalized)
}

export const VERDIEPING_FIXME =
  'verdieping, correct the building tag, add building:level and building:min_level before upload in JOSM!'

// Default OSM tags for supported KNW (kunstwerken) structure types, keyed by GRB type_code (issue #22).
export const KNW_TAG_MAP_BY_CODE: Record<string, Record<string, string>> = {
  // Overbrugging outlines are bridge areas; bridge=yes belongs on the crossing way, not the outline.
  '1': { man_made: 'bridge' },
  '5': { man_made: 'bridge_support' },
  '7': { man_made: 'chimney' },
  '8': { man_made: 'cooling_tower' },
  '11': { man_made: 'water_tower' },
  '14': {
    power: 'generator',
    'generator:source': 'wind',
    'generator:method': 'wind_turbine'
  },
  '22': { man_made: 'breakwater' },
  '23': { man_made: 'breakwater' },
  '24': { man_made: 'pier' }
}
