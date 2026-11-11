<template>
  <div class="flex items-start justify-between mb-3">
    <div>
      <div
        class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-osm border px-1.5 py-0.5 rounded mb-1.5"
      >
        <Building2 class="h-2.5 w-2.5" />OSM
      </div>
      <h2 class="text-sm font-semibold text-foreground">
        {{
          (feature.properties.building && feature.properties.building !== 'yes'
            ? feature.properties.building.charAt(0).toUpperCase() + feature.properties.building.slice(1)
            : null) || 'Building'
        }}
      </h2>
      <div class="text-[10px] font-mono text-muted-foreground mt-0.5">ID: {{ feature.properties.osm_id }}</div>
    </div>
    <button class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="$emit('close')">
      <X class="h-3.5 w-3.5" />
    </button>
  </div>
  <!-- Address group -->
  <div v-if="formatted.address.length > 0" class="mb-3">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Address</div>
    <div class="space-y-1 text-xs">
      <div v-for="[key, value] in formatted.address" :key="key" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">
          {{ formatPropertyKey(key) }}
        </span>
        <span class="text-foreground font-medium font-mono truncate" :title="String(value)">
          {{ formatPropertyValue(value) }}
        </span>
      </div>
    </div>
  </div>
  <!-- Geometry Source group -->
  <div v-if="formatted.source.length > 0" class="mb-3">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Geometry Source</div>
    <div class="space-y-1 text-xs">
      <div v-for="[key, value] in formatted.source" :key="key" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">
          {{ formatPropertyKey(key) }}
        </span>
        <span class="text-foreground font-medium font-mono truncate" :title="String(value)">
          {{ formatPropertyValue(value) }}
        </span>
      </div>
    </div>
  </div>
  <!-- Other properties -->
  <div v-if="formatted.other.length > 0">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Properties</div>
    <div class="space-y-1 text-xs">
      <div v-for="[key, value] in formatted.other" :key="key" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">
          {{ formatPropertyKey(key) }}
        </span>
        <span class="text-foreground font-medium font-mono truncate" :title="formatPropertyValue(value)">
          {{ formatPropertyValue(value) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { Building2, X } from 'lucide-vue-next'

const { feature } = defineProps<{ feature: MapGeoJSONFeature }>()

const formatted = computed(() => {
  const address: [string, any][] = []
  const source: [string, any][] = []
  const other: [string, any][] = []

  for (const [key, value] of Object.entries(feature.properties))
    if (key.startsWith('addr:') || key.startsWith('addr_')) address.push([key, value])
    else if (key.startsWith('source:geometry:') || key === 'source:geometry') source.push([key, value])
    else other.push([key, value])

  return { address, other, source }
})

const formatPropertyValue = (value: any): string => {
  if (value === null || value === undefined) return ''

  // Try to parse as date/datetime
  if (typeof value === 'string') {
    // Check if it looks like a date (YYYY-MM-DD or ISO datetime)
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch)
      try {
        const date = new Date(value)

        // Check if it's a valid date
        if (!isNaN(date.getTime())) {
          const hasTime = value.includes('T') || /\d{2}:\d{2}/.test(value)
          return formatDateValue(date, hasTime)
        }
      } catch {
        // If parsing fails, return original value
      }
  }

  return String(value)
}

const formatPropertyKey = (key: string) =>
  // Convert underscores to spaces and handle special cases
  key.replace(/_/g, ' ').replace(/:/g, ' ').replace(/addr /g, '').trim()

// Helper to format a valid Date as a localized string
const formatDateValue = (date: Date, includeTime: boolean): string => {
  if (includeTime)
    return new Intl.DateTimeFormat('nl-BE', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      second: '2-digit',
      year: 'numeric'
    }).format(date)

  return new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date)
}
</script>
