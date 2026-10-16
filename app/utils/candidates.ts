import type { Feature } from 'geojson'
import { isBuildingTypeLabel, KNW_TAG_MAP_BY_CODE, VERDIEPING_FIXME } from '~/utils/grbExportTags'

// The candidates contract: every source exposes its buildings with the same properties, in the database views
// grb.candidates, grb.knw_candidates, picc.candidates and urbis.candidates (processing/sql/migrations/grb/
// 004_candidates.sql), the Martin "candidates" tile sources and the difference API. The app reads every
// source through these properties only.

/**
 * Version of the contract, sent by the app with every difference request. The API refuses other values, so a page
 * loaded before a contract change asks to be reloaded instead of exporting properties it doesn't know.
 */
export const CANDIDATES_CONTRACT = 1

export const CANDIDATE_SOURCES = ['grb', 'knw', 'picc', 'urbis'] as const
export type CandidateSource = (typeof CANDIDATE_SOURCES)[number]

export const isCandidateSource = (value: unknown): value is CandidateSource =>
  typeof value === 'string' && (CANDIDATE_SOURCES as readonly string[]).includes(value)

/** Properties of a candidate (tiles leave out `details`). Text columns may be null; ids arrive as text. */
export interface CandidateProperties {
  fid: number | string
  source: CandidateSource
  entity: string | null
  source_id: string
  source_ref: string | null
  type_code: string | null
  type_label: string | null
  survey_date: string | null
  origin_label: string | null
  area_m2: number | null
  parent_id: string | null
  parent_type_label: string | null
  parent_part_count: number | null
  parent_area_m2: number | null
  addresses: string | null
  street_names: string | null
  postcodes: string | null
  municipalities: string | null
  address_count: number | null
  details?: Record<string, unknown> | null
}

/** Every contract column except geom, in the order of the views. */
export const CANDIDATE_COLUMNS = [
  'fid',
  'source',
  'entity',
  'source_id',
  'source_ref',
  'type_code',
  'type_label',
  'survey_date',
  'origin_label',
  'area_m2',
  'parent_id',
  'parent_type_label',
  'parent_part_count',
  'parent_area_m2',
  'addresses',
  'street_names',
  'postcodes',
  'municipalities',
  'address_count',
  'details'
] as const satisfies readonly (keyof CandidateProperties)[]

/** Database view of a source's candidates. */
export const CANDIDATE_VIEWS: Record<CandidateSource, string> = {
  grb: 'grb.candidates',
  knw: 'grb.knw_candidates',
  picc: 'picc.candidates',
  urbis: 'urbis.candidates'
}

/** Vector tile URL template of a source's candidates (Martin, behind Caddy). KNW is served by the GRB server. */
export const candidateTileUrl = (source: CandidateSource): string =>
  source === 'knw' ? '/tiles/grb/knw_candidates/{z}/{x}/{y}' : `/tiles/${source}/candidates/{z}/{x}/{y}`

// First entry of a comma-separated aggregate column (e.g. street_names), trimmed.
const firstListItem = (value: string | null | undefined): string => (String(value ?? '').split(',')[0] ?? '').trim()

/** Tags for the house address, only when the candidate has exactly one address (OSM: one address per object). */
const addressTags = (props: CandidateProperties): Record<string, string> => {
  const addresses = String(props.addresses ?? '').trim()
  if (Number(props.address_count ?? 0) !== 1 || !addresses) return {}
  const street = firstListItem(props.street_names)
  const tags: Record<string, string> = {}
  // The house number is what follows the street name, kept only when it looks like one ("12", "12A", "12/3").
  // A letter suffix must be a single letter, not the start of the next word ("12 Main Street").
  let remainder = addresses
  if (street && remainder.toLowerCase().startsWith(street.toLowerCase())) remainder = remainder.slice(street.length)
  const houseNumber = remainder.trim().match(/^\d+(?:\s*[A-Za-z](?![A-Za-z]))?(?:\s*\/\s*\w+)?/)
  if (street) tags['addr:street'] = street
  if (houseNumber) tags['addr:housenumber'] = houseNumber[0].replace(/\s+/g, '')
  const postcode = firstListItem(props.postcodes)
  if (postcode) tags['addr:postcode'] = postcode
  const city = firstListItem(props.municipalities)
  if (city) tags['addr:city'] = city
  return tags
}

/** Default tags of a KNW structure type (issue #22): type 9 is a silo, or a storage tank when its label says so. */
const knwTags = (props: CandidateProperties): Record<string, string> => {
  const code = String(props.type_code ?? '').trim()
  if (code === '9') {
    const label = String(props.type_label ?? '').toLowerCase()
    return { man_made: label.includes('opslagtank') && !label.includes('silo') ? 'storage_tank' : 'silo' }
  }
  return { ...KNW_TAG_MAP_BY_CODE[code] }
}

/**
 * The OSM tags of a candidate, per source (docs/GRB_PROPERTY_MAPPINGS.md, issues #22, #49 and #53):
 * - GRB: building=yes for the building types only (gbg-1, gbg-2, gba-1); a verdieping (gba-1) gets a fixme;
 * - KNW: the default tags of its type, no building tag;
 * - PICC and Urbis: building=yes;
 * - source:geometry:date (survey date) and source:geometry:ref (GRB and KNW reference) when known;
 * - addr:* when the candidate has exactly one address (not for KNW).
 */
export const candidateTags = (props: CandidateProperties): Record<string, string> => {
  const tags: Record<string, string> = {}
  const typeLabel = String(props.type_label ?? '')
    .toLowerCase()
    .trim()
  if (props.source === 'knw') {
    Object.assign(tags, knwTags(props))
  } else if (props.source !== 'grb' || isBuildingTypeLabel(typeLabel)) {
    tags.building = 'yes'
  }
  if (props.source === 'grb' && typeLabel === 'verdieping') tags.fixme = VERDIEPING_FIXME
  const surveyDate = String(props.survey_date ?? '').slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(surveyDate)) tags['source:geometry:date'] = surveyDate
  if (props.source_ref) tags['source:geometry:ref'] = props.source_ref
  if (props.source !== 'knw') Object.assign(tags, addressTags(props))
  return tags
}

/** A candidate feature with its OSM tags as properties, ready for the OSM XML export. */
export const candidateToOsmFeature = (feature: Feature): Feature => ({
  ...feature,
  properties: candidateTags(feature.properties as CandidateProperties)
})

/** Short id shown for a candidate: the GRB building (gebouw_id) when known, else the source id. */
export const candidateDisplayId = (props: Pick<CandidateProperties, 'source' | 'parent_id' | 'source_id'>): string =>
  props.source === 'grb' ? String(props.parent_id ?? props.source_id) : String(props.source_id)

/**
 * A source-specific extra of a candidate (uidn, length_m, georef_id, date_modif, ...): in `details` for the
 * difference API, a property of its own in vector tiles (ST_AsMVT writes each jsonb key as a property).
 */
export const candidateDetail = (props: Record<string, unknown>, key: string): unknown => {
  const details = props.details
  const value = details !== null && typeof details === 'object' ? (details as Record<string, unknown>)[key] : props[key]
  return value ?? null
}
