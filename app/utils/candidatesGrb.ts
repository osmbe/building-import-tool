// GRB tagging rules shared by the difference API (building type pre-filter) and the export
// (utils/candidates.ts, candidateTags).

import type { CandidateProperties } from './candidates'
import { addressTags, sourceGeometryTags } from './candidates'


export function grbTags(props: CandidateProperties): Record<string, string> {
  const tags: Record<string, string> = {
    ...addressTags(props),
    ...sourceGeometryTags(props)
  }

  const label = String(props.type_label ?? '')
    .toLowerCase()
    .trim()

  switch (label) {
    case 'afdak':
      tags.building = 'roof' // https://wiki.openstreetmap.org/wiki/Tag:building%3Droof
      break
    case 'verdieping':
      tags.building = 'yes' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dyes
      tags.fixme = 'verdieping, correct the building tag, add building:level and building:min_level before upload in JOSM!'
      break
    case '':
    case 'hoofdgebouw':
    case 'bijgebouw':
      tags.building = 'yes' // https://wiki.openstreetmap.org/wiki/Tag:building%3Dyes
      break
  }

  return tags
}
