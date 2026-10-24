<template>
  <div v-if="isOpen && building" class="absolute right-4 top-16 w-[380px] animate-fade-up">
    <div class="glass-panel rounded-lg overflow-hidden">
      <!-- Header -->
      <div class="px-4 pt-4 pb-3 border-b border-white/[0.05]">
        <div class="flex items-start justify-between">
          <div>
            <div
              class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded mb-2"
            >
              <Building2 class="h-2.5 w-2.5" />
              GRB Building
            </div>
            <h2 class="text-sm font-semibold text-foreground">{{ buildingTypeLabel }}</h2>
            <p class="text-[10px] font-mono text-muted-foreground mt-0.5">ID: {{ building.gebouw_id }}</p>
          </div>
          <button class="text-muted-foreground hover:text-foreground transition-colors mt-1" @click="$emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="p-4 space-y-4">
        <!-- Addresses (grouped by base address) -->
        <div v-if="addresses.length > 0">
          <div
            class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"
          >
            <MapPin class="h-3 w-3" /> Addresses ({{ addresses.length }})
          </div>
          <div class="space-y-1 pl-0">
            <div v-for="(group, idx) in groupedAddresses" :key="idx">
              <div class="text-xs text-foreground/80">{{ group.base }}</div>
              <div v-if="group.boxes.length > 0" class="text-[10px] text-muted-foreground mt-0.5 pl-2">
                bus {{ group.boxes.join(', ') }}
              </div>
            </div>
          </div>
        </div>

        <!-- Location -->
        <div v-if="hasLocationData">
          <div
            class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"
          >
            <MapPinned class="h-3 w-3" /> Location
          </div>
          <div class="space-y-1.5 text-xs">
            <div v-if="postcodes.length > 0" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Postcode</span>
              <span class="text-foreground/80">{{ postcodes.join(', ') }}</span>
            </div>
            <div v-if="municipalities.length > 0" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Municipality</span>
              <span class="text-foreground/80">{{ municipalities.join(', ') }}</span>
            </div>
            <div v-if="streetNames.length > 0" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Street</span>
              <span class="text-foreground/80">{{ streetNames.join(', ') }}</span>
            </div>
          </div>
        </div>

        <!-- Building details -->
        <div v-if="hasBuildingDetails">
          <div
            class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5"
          >
            <Ruler class="h-3 w-3" /> Building Details
          </div>
          <div class="space-y-1.5 text-xs">
            <div v-if="building.total_area_m2" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Total area</span>
              <span class="text-foreground/80 font-mono">{{ formattedArea }}</span>
            </div>
            <div v-if="building.polygon_count" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Parts</span>
              <span class="text-foreground/80 font-mono">{{ building.polygon_count }}</span>
            </div>
            <div v-if="building.type_label" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Type</span>
              <span class="text-foreground/80">{{ buildingTypeLabel }}</span>
            </div>
            <div v-if="building.survey_date" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Surveyed</span>
              <span class="text-foreground/80 font-mono">{{ building.survey_date }}</span>
            </div>
            <div v-if="building.origin_label" class="flex gap-4">
              <span class="text-muted-foreground w-24 shrink-0">Source</span>
              <span class="text-foreground/80">{{ formatOriginLabel(building.origin_label) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Building2, MapPin, MapPinned, Ruler, X } from 'lucide-vue-next'
import { computed } from 'vue'

interface GRBBuilding {
  gebouw_id: number
  polygon_count?: number
  total_area_m2?: number
  type_label?: string
  survey_date?: string
  origin_label?: string
  addresses?: string[] | string
  street_names?: string[] | string
  postcodes?: string[] | string
  municipalities?: string[] | string
  address_count?: number
}

const { building, isOpen } = defineProps<{
  building: GRBBuilding | null
  isOpen: boolean
}>()

defineEmits<{ (e: 'close'): void }>()

const parsePostgresArray = (value: string[] | string | undefined): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value

  const str = String(value).trim()
  if (str.startsWith('{') && str.endsWith('}')) {
    const inner = str.slice(1, -1)
    if (inner === '') return []

    const items: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of inner)
      if (char === '"') inQuotes = !inQuotes
      else if (char === ',' && !inQuotes) {
        items.push(current.trim())
        current = ''
      } else current += char

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

const addresses = computed(() => parsePostgresArray(building?.addresses))
const streetNames = computed(() => parsePostgresArray(building?.street_names))
const postcodes = computed(() => parsePostgresArray(building?.postcodes))
const municipalities = computed(() => parsePostgresArray(building?.municipalities))

// Group addresses that share the same base, collapsing box numbers
interface GroupedAddress {
  base: string
  boxes: string[]
}
const groupAddresses = (addrs: string[]): GroupedAddress[] => {
  const busPattern = /^(.+?)\s+bus\s+(.+?),\s*(.+)$/i
  const groups = new Map<string, string[]>()
  const order: string[] = []

  for (const addr of addrs) {
    const [, street, box, locality] = addr.match(busPattern) ?? []
    if (street && box && locality) {
      const base = `${street}, ${locality}`
      if (!groups.has(base)) {
        groups.set(base, [])
        order.push(base)
      }
      groups.get(base)!.push(box)
    } else if (!groups.has(addr)) {
      groups.set(addr, [])
      order.push(addr)
    }
  }

  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
  return order.map((base) => ({ base, boxes: groups.get(base)!.sort(collator.compare) }))
}

const groupedAddresses = computed(() => groupAddresses(addresses.value))

const formattedArea = computed(() => {
  if (!building?.total_area_m2) return '—'
  const area = building.total_area_m2
  return area >= 1000 ? `${(area / 1000).toFixed(2)} km²` : `${area.toFixed(0)} m²`
})

const buildingTypeLabel = computed(() => {
  const type = building?.type_label
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
})

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

const hasLocationData = computed(
  () => postcodes.value.length > 0 || municipalities.value.length > 0 || streetNames.value.length > 0
)

const hasBuildingDetails = computed(
  () =>
    building?.total_area_m2 ||
    building?.polygon_count ||
    building?.type_label ||
    building?.survey_date ||
    building?.origin_label
)
</script>
