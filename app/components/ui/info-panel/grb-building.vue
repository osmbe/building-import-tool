<template v-if="feature.properties._layer_type === 'grb'">
  <div class="flex items-start justify-between mb-3">
    <div>
      <div
        class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-grb border px-1.5 py-0.5 rounded mb-1.5"
      >
        <Building2 class="h-2.5 w-2.5" />GRB
      </div>
      <h2 class="text-sm font-semibold text-foreground">
        {{ formatGRBBuildingType(feature.properties.type_label || feature.properties.parent_type_label) }}
      </h2>
      <div v-if="feature.properties.parent_id" class="text-[10px] font-mono text-muted-foreground mt-0.5">
        Building ID: {{ feature.properties.parent_id }}
      </div>
      <div v-if="feature.properties.source_ref" class="text-[10px] font-mono text-muted-foreground">
        OIDN: {{ feature.properties.source_ref }}
      </div>
    </div>
    <button class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="$emit('close')">
      <X class="h-3.5 w-3.5" />
    </button>
  </div>

  <!-- Addresses (grouped by base address) -->
  <div v-if="feature.properties.addresses" class="mb-3">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Addresses</div>
    <div class="space-y-1">
      <div v-for="(group, idx) in groupAddresses(parsePostgresArray(feature.properties.addresses))" :key="idx">
        <div class="text-xs text-foreground font-medium">{{ group.base }}</div>
        <div v-if="group.boxes.length > 0" class="text-[10px] text-muted-foreground mt-0.5 pl-2">
          bus {{ group.boxes.join(', ') }}
        </div>
      </div>
    </div>
  </div>

  <!-- Location -->
  <div
    v-if="
      !feature.properties.addresses &&
      (feature.properties.street_names || feature.properties.postcodes || feature.properties.municipalities)
    "
    class="mb-3"
  >
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Location</div>
    <div class="space-y-1 text-xs">
      <div v-if="feature.properties.street_names" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Street</span>
        <span class="text-foreground font-medium">{{
          parsePostgresArray(feature.properties.street_names).join(', ')
        }}</span>
      </div>
      <div v-if="feature.properties.postcodes" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
        <span class="text-foreground font-medium">{{
          parsePostgresArray(feature.properties.postcodes).join(', ')
        }}</span>
      </div>
      <div v-if="feature.properties.municipalities" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
        <span class="text-foreground font-medium">{{
          parsePostgresArray(feature.properties.municipalities).join(', ')
        }}</span>
      </div>
    </div>
  </div>

  <!-- Details (only show if at least one field present) -->
  <div
    v-if="
      feature.properties.parent_area_m2 ||
      feature.properties.parent_part_count ||
      feature.properties.survey_date ||
      feature.properties.origin_label
    "
  >
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Details</div>
    <div class="space-y-1 text-xs">
      <div v-if="feature.properties.parent_area_m2" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Area</span>
        <span class="text-foreground font-medium font-mono">{{ formatArea(feature.properties.parent_area_m2) }}</span>
      </div>
      <div v-if="feature.properties.parent_part_count" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Parts</span>
        <span class="text-foreground font-medium font-mono">{{ feature.properties.parent_part_count }}</span>
      </div>
      <div v-if="feature.properties.survey_date" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
        <span class="text-foreground font-medium font-mono">{{ feature.properties.survey_date }}</span>
      </div>
      <div v-if="feature.properties.origin_label" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Source</span>
        <span class="text-foreground font-medium">{{ formatOriginLabel(feature.properties.origin_label) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Feature, MapGeoJSONFeature } from 'maplibre-gl'
import { Building2, X } from 'lucide-vue-next'
import { formatArea } from '~/lib/utils'

const { feature } = defineProps<{ feature: MapGeoJSONFeature }>()

// Helper function to translate GRB building types
const formatGRBBuildingType = (type: string | undefined): string => {
  if (!type) return 'Building'

  const translations: Record<string, string> = {
    afdak: 'Shelter',
    berging: 'Storage',
    bijgebouw: 'Outbuilding',
    garage: 'Garage',
    'gebouw afgezoomd met virtuele gevels': 'Building with Virtual Facades',
    hoofdgebouw: 'Main Building',
    'ingezonken garagetoegang': 'Sunken Garage Entrance',
    loopbrug: 'Walkway',
    serre: 'Conservatory',
    trap: 'Staircase',
    verdieping: 'Upper Floor',
    'verheven garagetoegang': 'Elevated Garage Entrance',
    'zichtbare onderkeldering': 'Visible Basement'
  }

  return translations[type.toLowerCase()] || type
}

// Helper function to translate GRB origin labels (Dutch to English)
const formatOriginLabel = (label: string | undefined): string => {
  if (!label) return ''
  const translations: Record<string, string> = {
    andere: 'Other',
    'as-built plan': 'As-Built Plan',
    fotogrammetrisch: 'Photogrammetry',
    gedigitaliseerd: 'Digitized',
    'gemeentelijk as-built plan': 'Municipal As-Built Plan',
    luchtfoto: 'Aerial Photo',
    'niet gekend': 'Unknown',
    terreinbezoek: 'Field Survey'
  }
  return translations[label.toLowerCase()] || label
}

// Group addresses that share the same base address, collapsing box numbers
// E.g. ["Boekfos 49, 1730 Asse", "Boekfos 49 bus 1, 1730 Asse", "Boekfos 49 bus 2, 1730 Asse"]
//   → [{ base: "Boekfos 49, 1730 Asse", boxes: ["1", "2"] }]
interface GroupedAddress {
  base: string
  boxes: string[]
}
const groupAddresses = (addresses: string[]): GroupedAddress[] => {
  // Pattern: "<street> <number> bus <box>, <postcode> <city>"
  const busPattern = /^(.+?)\s+bus\s+(.+?),\s*(.+)$/i
  const groups = new Map<string, string[]>()
  const order: string[] = []

  for (const addr of addresses) {
    const [, street, box, locality] = addr.match(busPattern) ?? []
    if (street && box && locality) {
      const base = `${street}, ${locality}`
      if (!groups.has(base)) {
        groups.set(base, [])
        order.push(base)
      }
      groups.get(base)!.push(box)
    } else // No bus number — standalone address
    if (!groups.has(addr)) {
      groups.set(addr, [])
      order.push(addr)
    }
  }

  // Sort box numbers naturally (1, 2, 3, ... 10, 11 instead of 1, 10, 11, 2)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  return order.map((base) => ({
    base,
    boxes: groups.get(base)!.sort(collator.compare)
  }))
}

// Helper function to parse PostgreSQL array format {item1,item2} to JS array
const parsePostgresArray = (value: string[] | string | undefined): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value

  // Handle PostgreSQL array format: {item1,item2,"item with spaces"}
  const str = String(value).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    const inner = str.slice(1, -1)
    if (inner === '') return []

    // Split by comma, but respect quoted strings
    const items: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of inner)
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        items.push(current.trim())
        current = ''
      } else {
        current += char
      }

    if (current) items.push(current.trim())

    return items.map((item) => item.replace(/^"|"$/g, ''))
  }

  // Handle '; '-separated strings (STRING_AGG with '; ' separator, e.g. addresses column)
  if (str.includes('; '))
    return str
      .split('; ')
      .map((s) => s.trim())
      .filter(Boolean)

  return [str]
}
</script>
