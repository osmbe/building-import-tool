/**
 * Match mode rules shared by the UI and the difference API (issue #6).
 * Pure functions only, so they can be unit-tested without the Nuxt runtime.
 */
export type MatchMode = 'geometry' | 'source' | 'both'
export type DifferenceDataSource = 'grb' | 'knw' | 'picc' | 'urbis'

/** Source-tag matching (source:geometry:oidn / :ref) only exists for GRB data. */
export const supportsSourceTags = (dataSource: DifferenceDataSource): boolean => dataSource === 'grb'

/**
 * Mode actually sent to the API. Source and combined modes are GRB-only, so for any other
 * source we fall back to geometry matching (instead of the API answering 400).
 */
export const resolveMatchMode = (
  mode: MatchMode,
  dataSource: DifferenceDataSource
): { mode: MatchMode; downgraded: boolean } =>
  mode !== 'geometry' && !supportsSourceTags(dataSource)
    ? { downgraded: true, mode: 'geometry' }
    : { downgraded: false, mode }

/**
 * Whether a source building stays a candidate (is missing from OSM).
 * - geometry: dropped if an OSM building overlaps it
 * - source: dropped if an OSM building references it via a source tag
 * - both: dropped if EITHER of the above holds (union of the two exclusions)
 */
export const isCandidate = (mode: MatchMode, matched: { byGeometry: boolean; bySourceTag: boolean }): boolean => {
  switch (mode) {
    case 'geometry':
      return !matched.byGeometry
    case 'source':
      return !matched.bySourceTag
    case 'both':
      return !matched.byGeometry && !matched.bySourceTag
  }
}
