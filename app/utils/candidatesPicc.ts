import type { CandidateProperties } from './candidates'
import { addressTags, sourceGeometryTags } from './candidates'

export function piccTags(props: CandidateProperties): Record<string, string> {
  return {
    ...addressTags(props),
    ...sourceGeometryTags(props),
    building: 'yes'
  }
}
