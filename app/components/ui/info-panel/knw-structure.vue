<template>
  <div class="flex items-start justify-between mb-3">
    <div>
      <div
        class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-knw border px-1.5 py-0.5 rounded mb-1.5"
      >
        <Landmark class="h-2.5 w-2.5" />KNW
      </div>
      <h2 class="text-sm font-semibold text-foreground">
        {{ feature.properties.type_label || 'Structure' }}
      </h2>
      <div class="text-[10px] font-mono text-muted-foreground mt-0.5">OIDN: {{ feature.properties.source_id }}</div>
    </div>
    <button class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="$emit('close')">
      <X class="h-3.5 w-3.5" />
    </button>
  </div>

  <div
    v-if="
      feature.properties.area_m2 ||
      candidateDetail(feature.properties, 'length_m') ||
      feature.properties.survey_date ||
      feature.properties.origin_label ||
      feature.properties.type_code
    "
  >
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Details</div>
    <div class="space-y-1 text-xs">
      <div v-if="feature.properties.type_code" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Type code</span>
        <span class="text-foreground font-medium font-mono">{{ feature.properties.type_code }}</span>
      </div>
      <div v-if="feature.properties.area_m2" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Area</span>
        <span class="text-foreground font-medium font-mono">{{ formatArea(feature.properties.area_m2) }}</span>
      </div>
      <div v-if="candidateDetail(feature.properties, 'length_m')" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Length</span>
        <span class="text-foreground font-medium font-mono"
          >{{ Number(candidateDetail(feature.properties, 'length_m')).toFixed(2) }} m</span
        >
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
import { Landmark, X } from 'lucide-vue-next'
import { formatArea } from '~/lib/utils'

const { feature } = defineProps<{ feature: MapGeoJSONFeature }>()

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
</script>
