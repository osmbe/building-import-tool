import type { Feature } from 'geojson'

// GRB GBA/GBG polygon type labels (LBLTYPE) that must NOT be tagged as a building.
// - "verdieping" is handled specially (kept as building + fixme), so it is NOT in this set.
// - "gebouw afgezoomd met virtuele gevels" is the gbg-3 virtual-facade outline.
export const NON_BUILDING_TYPE_LABELS = new Set(['trap', 'gebouw afgezoomd met virtuele gevels'])

export const VERDIEPING_FIXME =
  'verdieping, correct the building tag, add building:level and building:min_level before upload in JOSM!'

// Default OSM tags for supported KNW (kunstwerken) structure types, keyed by GRB type_code (issue #22).
export const KNW_TAG_MAP_BY_CODE: Record<string, Record<string, string>> = {
  '1': { bridge: 'yes' },
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

/**
 * Transform a GRB/PICC/Urbis/KNW candidate feature into one carrying OSM-ready tags.
 *
 * Pure function (no Vue/runtime deps) so it can be unit-tested in isolation. Maps GRB properties
 * to OSM tags per docs/GRB_PROPERTY_MAPPINGS.md and the rules in issues #22, #49 and #53.
 */
// First entry of a comma-separated aggregate column (e.g. street_names), trimmed.
const firstListItem = (value: string | number | null | undefined): string =>
  (String(value || '').split(',')[0] ?? '').trim()

export const filterFeatureProperties = (feature: Feature): Feature => {
  const props: Record<string, any> = { ...feature.properties }

  const sourceLayerType = String(props._layer_type || '').toLowerCase()
  const explicitEntity = String(props.entity || props.source_geometry_entity || '').toLowerCase()
  const isKnw = sourceLayerType === 'knw' || explicitEntity === 'knw' || explicitEntity === 'kunstwerken'

  // GRB polygon type label (LBLTYPE) drives building pre-filtering (issue #53)
  const polygonTypeLabel = String(props.type_label || props.lbltype || '')
    .toLowerCase()
    .trim()
  const isVerdieping = polygonTypeLabel === 'verdieping'
  const isNonBuildingType = NON_BUILDING_TYPE_LABELS.has(polygonTypeLabel)

  // Export candidate polygons as buildings by default (not for KNW structures).
  // gbg-3 (virtual facade) and other non-building GRB types must not get a building tag.
  if (!isKnw && !props.building && !isNonBuildingType) {
    props.building = 'yes'
  }

  // GBA "verdieping" (floor level): keep building tag but flag for manual correction in JOSM (issue #53)
  if (!isKnw && isVerdieping) {
    props.fixme = VERDIEPING_FIXME
  }

  // Add default tags for supported KNW structure types
  if (isKnw) {
    const typeCode = String(props.type_code || '').trim()
    const typeLabel = String(props.type_label || props.lbltype || '')
      .toLowerCase()
      .trim()

    const mappedTags =
      typeCode === '9'
        ? { man_made: typeLabel.includes('opslagtank') && !typeLabel.includes('silo') ? 'storage_tank' : 'silo' }
        : KNW_TAG_MAP_BY_CODE[typeCode]

    if (mappedTags) {
      Object.entries(mappedTags).forEach(([key, value]) => {
        if (!props[key]) {
          props[key] = value
        }
      })
    }

    delete props.building
  }

  // Map GRB OIDN to source:geometry:oidn
  if (props.oidn) {
    props['source:geometry:oidn'] = props.oidn
  }

  // Map GRB OPNDATUM/survey_date to source:geometry:date, always date-only (YYYY-MM-DD).
  // Values may arrive as DD/MM/YYYY, YYYY-MM-DD, or a full ISO datetime (e.g. 2023-03-15T00:00:00).
  // PICC (Wallonia) provides its survey date as date_leve (levé).
  const rawDate = props.opndatum || props.survey_date || props.date_leve
  if (rawDate) {
    const raw = String(rawDate).trim()
    // Strip any time component (T-separated or space-separated)
    const dateOnly = raw.split(/[T ]/)[0] ?? ''
    if (dateOnly.includes('/')) {
      const parts = dateOnly.split('/')
      if (parts.length === 3) {
        const [day = '', month = '', year = ''] = parts
        props['source:geometry:date'] = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      }
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
      props['source:geometry:date'] = dateOnly
    }
  }

  // Set source:geometry:entity from feature type
  props['source:geometry:entity'] = isKnw ? 'Knw' : 'Gbg'

  // Create source:geometry:ref composite property
  if (props['source:geometry:entity'] && props['source:geometry:oidn']) {
    props['source:geometry:ref'] = `${props['source:geometry:entity']}/${props['source:geometry:oidn']}`
  }

  // Migrate auto_building to building tag (fallback)
  if (props.auto_building && !props.building) {
    props.building = props.auto_building
  }

  // Issue #49: attach address information for GRB/PICC/Urbis exports.
  // OSM convention is one address per object, so auto-emit addr:* tags ONLY when the candidate
  // has exactly one address. Multi-address buildings are left for manual handling in JOSM.
  const addressCount = Number(props.address_count || 0)
  const addressesStr = String(props.addresses || '').trim()
  if (!isKnw && addressCount === 1 && addressesStr) {
    const street = firstListItem(props.street_names)
    const postcode = firstListItem(props.postcodes)
    const city = firstListItem(props.municipalities)

    // Derive the house number from the full address by stripping the street prefix,
    // then keep only a house-number-shaped token (e.g. "12", "12A", "12/3").
    let remainder = addressesStr
    if (street && remainder.toLowerCase().startsWith(street.toLowerCase())) {
      remainder = remainder.slice(street.length)
    }
    const hnMatch = remainder.trim().match(/^\d+\s*[A-Za-z]?(?:\s*\/\s*\w+)?/)

    if (street && !props['addr:street']) props['addr:street'] = street
    if (hnMatch && !props['addr:housenumber']) {
      props['addr:housenumber'] = hnMatch[0].replace(/\s+/g, '')
    }
    if (postcode && !props['addr:postcode']) props['addr:postcode'] = postcode
    if (city && !props['addr:city']) props['addr:city'] = city
  }

  // Remove GRB-specific properties that shouldn't be exported
  const tagsToRemove = [
    // GRB internal properties
    'ogc_fid',
    'oidn',
    'uidn',
    'gebouw_id',
    'versie',
    'begindatum',
    'versdatum',
    'type',
    'type_code',
    'type_label',
    'lbltype',
    'opndatum',
    'survey_date',
    'date_leve',
    'date_modif',
    'georef_id',
    'natur_desc',
    'bgninv',
    'lblbgninv',
    'lengte',
    'oppervl',
    // Metadata tags
    'size_grb_building',
    'source:geometry:uidn',
    'source',
    'H_DTM_MIN',
    'H_DTM_GEM',
    'H_DSM_MAX',
    'H_DSM_P99',
    'HN_MAX',
    'HN_P99',
    'detection_method',
    'size_shared',
    'size_source_building',
    'auto_building',
    'size_source_landuse',
    'source:geometry:entity',
    'source:geometry:oidn',
    'auto_target_landuse',
    'entity',
    '_layer_type',
    // Aggregated address fields (consumed above into addr:* tags)
    'addresses',
    'street_names',
    'postcodes',
    'municipalities',
    'address_count',
    'building_id',
    'inspire_id',
    'objectid',
    'natur_code'
  ]

  tagsToRemove.forEach((tag) => {
    delete props[tag]
  })

  return {
    ...feature,
    properties: props
  }
}
