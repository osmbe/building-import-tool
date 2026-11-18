// GRB tagging rules shared by the difference API (building type pre-filter) and the export
// (utils/candidates.ts, candidateTags).

import type { CandidateProperties } from './candidates'
import { addressTags, sourceGeometryTags } from './candidates'

// GRB polygon type labels (LBLTYPE) that may be exported as a building (issue #53). Allow-list:
// - GBG: only gbg-1 "hoofdgebouw" and gbg-2 "bijgebouw" (NOT gbg-3 "gebouw afgezoomd met virtuele gevels").
// - GBA: only gba-1 "verdieping" (exported with a fixme) and gba-2 "afdak" (exported as building=roof).
//   Every other GBA type (trap, luifel, ...) is excluded.
export const BUILDING_TYPE_LABELS = ['hoofdgebouw', 'bijgebouw', 'verdieping']

// GBA types exported as building=roof instead of the default building=yes.
export const ROOF_TYPE_LABELS = ['afdak']

export const VERDIEPING_FIXME =
  'verdieping, correct the building tag, add building:level and building:min_level before upload in JOSM!'

export function grbTags(props: CandidateProperties): Record<string, string> {
  const tags: Record<string, string> = {
    ...addressTags(props),
    ...sourceGeometryTags(props)
  }

  const label = String(props.type_label ?? '')
    .toLowerCase()
    .trim()

  if (ROOF_TYPE_LABELS.includes(label)) tags.building = 'roof'
  else if (label === '' || BUILDING_TYPE_LABELS.includes(label)) tags.building = 'yes'

  if (label === 'verdieping') tags.fixme = VERDIEPING_FIXME

  return tags
}
