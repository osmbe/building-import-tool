<template>
  <div class="flex items-start justify-between mb-3">
    <div>
      <div
        class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest layer-badge-urbis border px-1.5 py-0.5 rounded mb-1.5"
      >
        <Building2 class="h-2.5 w-2.5" />UrbIS
      </div>
      <h2 class="text-sm font-semibold text-foreground">Building</h2>
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
  <div v-if="feature.properties.area_m2 || feature.properties.source_id">
    <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Details</div>
    <div class="space-y-1 text-xs">
      <div v-if="feature.properties.area_m2" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Area</span>
        <span class="text-foreground font-medium font-mono">{{ formatArea(feature.properties.area_m2) }}</span>
      </div>
      <div v-if="feature.properties.source_id" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">INSPIRE</span>
        <span class="text-foreground font-medium font-mono text-[10px]">{{ feature.properties.source_id }}</span>
      </div>
      <div v-if="feature.properties.parent_id" class="flex gap-3">
        <span class="text-muted-foreground w-20 shrink-0">Block</span>
        <span class="text-foreground font-medium font-mono">{{ feature.properties.parent_id }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MapGeoJSONFeature } from 'maplibre-gl'
import { Building2, X } from 'lucide-vue-next'
import { formatArea, parseSemicolonList } from '~/lib/utils'

const { feature } = defineProps<{ feature: MapGeoJSONFeature }>()
</script>
