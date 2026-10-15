// Parsing of GRB identifiers stored on OSM buildings (issue #52).
//
// Real-world formats:
// - source:geometry:ref  = "Gbg/1371282"              (entity/oidn, by far the most common)
// - source:geometry:ref  = "Gbg/1422118;Gbg/1422195"  (merged building: several refs, ';'-separated)
// - source:geometry:ref  = "Gba/2664;Gbg/58610"       (mixed GBA/GBG entities)
// - source:geometry:oidn = "1371282" (rare; may also hold "Gbg/123" or "1;2"), with the entity in
//   source:geometry:entity when the older tagging scheme was used
//
// OIDNs are only unique per entity (Gbg/2664 and Gba/2664 are different objects), so references are
// returned as normalised "Entity/oidn" keys, e.g. "Gbg/1371282".

export type GrbEntity = 'Gbg' | 'Gba' | 'Knw'

export interface OsmSourceOidnInput {
  /** Value of the source:geometry:oidn tag (or the legacy osm_buildings.oidn column). */
  oidn?: string | null
  /** Value of the source:geometry:ref tag. */
  ref?: string | null
  /** Value of the source:geometry:entity tag, used for oidn values without an entity prefix. */
  entity?: string | null
}

const ENTITIES: Record<string, GrbEntity> = { gbg: 'Gbg', gba: 'Gba', knw: 'Knw' }

/** Canonical entity name ("GBG", " gbg " -> "Gbg"), or null when it is not a GRB entity. */
function normalizeEntity(raw: string | null | undefined): GrbEntity | null {
  return ENTITIES[(raw ?? '').trim().toLowerCase()] ?? null
}

/** Normalise one reference ("Gbg/0123", " 123") to an "Entity/oidn" key, or '' when it is not one. */
function normalizeRef(raw: string, defaultEntity: GrbEntity): string {
  const parts = raw.split('/')
  const id = (parts.pop() ?? '').trim()
  if (!/^\d+$/.test(id)) return ''
  const entity = parts.length > 0 ? normalizeEntity(parts.join('/')) : defaultEntity
  if (!entity) return ''
  // "0123" and "123" are the same OIDN. Keep "0" itself.
  return `${entity}/${id.replace(/^0+(?=\d)/, '')}`
}

/** Split a (possibly multi-valued) tag value into normalised "Entity/oidn" keys. */
export function parseRefValues(value: string | null | undefined, defaultEntity: GrbEntity = 'Gbg'): string[] {
  if (!value) return []
  return value
    .split(';')
    .map((part) => normalizeRef(part, defaultEntity))
    .filter((key) => key !== '')
}

/** All GRB references ("Entity/oidn") of one OSM object's source:geometry:* tags. */
export function parseOsmSourceRefs({ oidn, ref, entity }: OsmSourceOidnInput): string[] {
  const oidnEntity = normalizeEntity(entity) ?? 'Gbg'
  return [...new Set([...parseRefValues(oidn, oidnEntity), ...parseRefValues(ref)])]
}

/** Deduplicated reference list for many OSM objects. */
export function collectOsmSourceRefs(items: OsmSourceOidnInput[]): string[] {
  const all = new Set<string>()
  for (const item of items) for (const key of parseOsmSourceRefs(item)) all.add(key)
  return [...all]
}
