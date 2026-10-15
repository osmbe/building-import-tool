// Parsing of GRB identifiers stored on OSM buildings (issue #52).
//
// Real-world formats:
// - source:geometry:ref  = "Gbg/1371282"              (entity/oidn, by far the most common)
// - source:geometry:ref  = "Gbg/1422118;Gbg/1422195"  (merged building: several refs, ';'-separated)
// - source:geometry:ref  = "Gba/2664;Gbg/58610"       (mixed GBA/GBG entities)
// - source:geometry:oidn = "1371282" (rare; may also hold "Gbg/123" or "1;2")

export interface OsmSourceOidnInput {
  /** Value of the source:geometry:oidn tag (or the legacy osm_buildings.oidn column). */
  oidn?: string | null
  /** Value of the source:geometry:ref tag. */
  ref?: string | null
}

/** Normalise one GRB identifier: strip entity prefix ("Gbg/"), whitespace and leading zeros. */
function normalizeOidn(raw: string): string {
  const id = (raw.split('/').pop() ?? '').trim()
  if (!/^\d+$/.test(id)) return ''
  // "0123" and "123" are the same OIDN. Keep "0" itself.
  return id.replace(/^0+(?=\d)/, '')
}

/** Split a (possibly multi-valued) tag value into normalised numeric OIDNs. */
export function parseOidnValues(value: string | null | undefined): string[] {
  if (!value) return []
  return value
    .split(';')
    .map(normalizeOidn)
    .filter((id) => id !== '')
}

/** All GRB OIDNs referenced by one OSM object's source:geometry:oidn / source:geometry:ref tags. */
export function parseOsmSourceOidns({ oidn, ref }: OsmSourceOidnInput): string[] {
  return [...new Set([...parseOidnValues(oidn), ...parseOidnValues(ref)])]
}

/** Deduplicated OIDN list for many OSM objects. */
export function collectOsmSourceOidns(items: OsmSourceOidnInput[]): string[] {
  const all = new Set<string>()
  for (const item of items) for (const id of parseOsmSourceOidns(item)) all.add(id)
  return [...all]
}
