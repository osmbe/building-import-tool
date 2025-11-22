<template>
  <div v-if="isOpen && building" class="absolute right-4 top-20 w-[420px]">
    <Card class="p-4 shadow-xl bg-slate-800 text-gray-100 border-slate-600">
      <!-- Header -->
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2">
            <Building2 class="h-5 w-5 text-blue-400" />
            <h2 class="text-lg font-semibold">{{ buildingTypeLabel }}</h2>
          </div>
          <div class="text-xs text-gray-400 mt-1">
            GRB ID: {{ building.gebouw_id }}
          </div>
        </div>
        <Button variant="ghost" size="icon" @click="$emit('close')">
          <X class="h-4 w-4" />
        </Button>
      </div>

      <!-- Building Info -->
      <div class="space-y-4">
        <!-- Addresses Section -->
        <div v-if="addresses.length > 0" class="space-y-2">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
            <MapPin class="h-4 w-4" />
            <span>Addresses ({{ addresses.length }})</span>
          </div>
          <div class="pl-6 space-y-1">
            <div
              v-for="(address, idx) in addresses"
              :key="idx"
              class="text-sm text-gray-200 py-1"
            >
              {{ address }}
            </div>
          </div>
        </div>

        <!-- Location Section -->
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
            <MapPinned class="h-4 w-4" />
            <span>Location</span>
          </div>
          <div class="pl-6 space-y-1 text-sm">
            <div v-if="postcodes.length > 0" class="flex justify-between">
              <span class="text-gray-400">Postcode:</span>
              <span class="text-gray-200">{{ postcodes.join(', ') }}</span>
            </div>
            <div v-if="municipalities.length > 0" class="flex justify-between">
              <span class="text-gray-400">Municipality:</span>
              <span class="text-gray-200">{{ municipalities.join(', ') }}</span>
            </div>
            <div v-if="streetNames.length > 0" class="flex justify-between">
              <span class="text-gray-400">Street:</span>
              <span class="text-gray-200">{{ streetNames.join(', ') }}</span>
            </div>
          </div>
        </div>

        <!-- Building Details Section -->
        <div class="space-y-2">
          <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
            <Ruler class="h-4 w-4" />
            <span>Building Details</span>
          </div>
          <div class="pl-6 space-y-1 text-sm">
            <div class="flex justify-between">
              <span class="text-gray-400">Total Area:</span>
              <span class="text-gray-200">{{ formattedArea }}</span>
            </div>
            <div v-if="building.polygon_count" class="flex justify-between">
              <span class="text-gray-400">Polygon Parts:</span>
              <span class="text-gray-200">{{ building.polygon_count }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-400">Type:</span>
              <span class="text-gray-200">{{ buildingTypeLabel }}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Card from '~/components/ui/card.vue'
import Button from '~/components/ui/button.vue'
import { X, Building2, MapPin, MapPinned, Ruler } from 'lucide-vue-next'

interface GRBBuilding {
  gebouw_id: number
  polygon_count?: number
  total_area_m2?: number
  type_label?: string
  addresses?: string[] | string
  street_names?: string[] | string
  postcodes?: string[] | string
  municipalities?: string[] | string
  address_count?: number
}

const props = defineProps<{
  building: GRBBuilding | null
  isOpen: boolean
}>()

defineEmits<{ (e: 'close'): void }>()

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

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === ',' && !inQuotes) {
        items.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    if (current) items.push(current.trim())

    return items.map(item => item.replace(/^"|"$/g, ''))
  }

  return [str]
}

// Computed properties for formatted data
const addresses = computed(() => parsePostgresArray(props.building?.addresses))
const streetNames = computed(() => parsePostgresArray(props.building?.street_names))
const postcodes = computed(() => parsePostgresArray(props.building?.postcodes))
const municipalities = computed(() => parsePostgresArray(props.building?.municipalities))

const formattedArea = computed(() => {
  if (!props.building?.total_area_m2) return '—'
  const area = props.building.total_area_m2
  if (area >= 1000) {
    return `${(area / 1000).toFixed(2)} km²`
  }
  return `${area.toFixed(0)} m²`
})

const buildingTypeLabel = computed(() => {
  const type = props.building?.type_label
  if (!type) return 'Building'

  // Translate common Dutch building types
  const translations: Record<string, string> = {
    'hoofdgebouw': 'Main Building',
    'bijgebouw': 'Outbuilding',
    'afdak': 'Shelter',
    'garage': 'Garage',
    'berging': 'Storage',
    'serre': 'Conservatory'
  }

  return translations[type.toLowerCase()] || type
})
</script>
