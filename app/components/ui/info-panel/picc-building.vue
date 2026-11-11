<template>
  <div class="flex items-start justify-between mb-3">
    <div>
      <div
        class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-picc border px-1.5 py-0.5 rounded mb-1.5"
      >
        <Building2 class="h-2.5 w-2.5" />PICC
      </div>
      <h2 class="text-sm font-semibold text-foreground">{{ feature.properties.type_label || 'Building' }}</h2>
      <div class="text-[10px] font-mono text-muted-foreground mt-0.5">ID: {{ feature.properties.source_id }}</div>
    </div>
    <button class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="$emit('close')">
      <X class="h-3.5 w-3.5" />
    </button>
  </div>

  <!-- Addresses -->
  <div v-if="feature.properties.addresses" class="mb-3">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Addresses</div>
    <div class="space-y-0.5 text-xs">
      <div
        v-for="(addr, idx) in parseSemicolonList(feature.properties.addresses)"
        :key="idx"
        class="text-foreground font-medium"
      >
        {{ addr }}
      </div>
    </div>
  </div>

  <!-- Location (when no detailed addresses) -->
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
          parseSemicolonList(feature.properties.street_names).join(', ')
        }}</span>
      </div>
      <div v-if="feature.properties.postcodes" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
        <span class="text-foreground font-medium">{{
          parseSemicolonList(feature.properties.postcodes).join(', ')
        }}</span>
      </div>
      <div v-if="feature.properties.municipalities" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
        <span class="text-foreground font-medium">{{
          parseSemicolonList(feature.properties.municipalities).join(', ')
        }}</span>
      </div>
    </div>
  </div>

  <!-- Details -->
  <div
    v-if="
      feature.properties.area_m2 ||
      feature.properties.type_code ||
      candidateDetail(feature.properties, 'date_modif') ||
      feature.properties.survey_date
    "
  >
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Details</div>
    <div class="space-y-1 text-xs">
      <div v-if="feature.properties.area_m2" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Area</span>
        <span class="text-foreground font-medium font-mono">{{ formatArea(feature.properties.area_m2) }}</span>
      </div>
      <div v-if="feature.properties.type_code" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Type</span>
        <span class="text-foreground font-medium">{{
          feature.properties.type_label || feature.properties.type_code
        }}</span>
      </div>
      <div v-if="feature.properties.survey_date" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
        <span class="text-foreground font-medium font-mono">{{ formatPiccDate(feature.properties.survey_date) }}</span>
      </div>
      <div v-if="candidateDetail(feature.properties, 'date_modif')" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Modified</span>
        <span class="text-foreground font-medium font-mono">{{
          formatPiccDate(String(candidateDetail(feature.properties, 'date_modif')))
        }}</span>
      </div>
      <div v-if="candidateDetail(feature.properties, 'georef_id')" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">GeoRef</span>
        <span
          class="text-foreground font-medium font-mono text-[10px] truncate"
          :title="String(candidateDetail(feature.properties, 'georef_id'))"
          >{{ candidateDetail(feature.properties, 'georef_id') }}</span
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Feature, MapGeoJSONFeature } from 'maplibre-gl'
import { Building2, X } from 'lucide-vue-next'
import { formatArea, parseSemicolonList } from '~/lib/utils'

const { feature } = defineProps<{ feature: MapGeoJSONFeature }>()

// Helper to format PICC dates to yyyy-mm-dd
const formatPiccDate = (value: string | undefined): string => {
  if (!value) return '—'
  try {
    const date = new Date(value)
    if (isNaN(date.getTime())) return value
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  } catch {
    return value
  }
}
</script>
