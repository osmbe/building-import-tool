<template>
  <div class="absolute bottom-4 left-4">
    <div class="glass-panel rounded-lg overflow-hidden">
      <!-- Header -->
      <div
        class="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
        :class="!layersCollapsed ? 'border-b border-white/[0.05]' : ''"
        @click="layersCollapsed = !layersCollapsed"
      >
        <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Layers</h3>
        <ChevronDown
          class="h-3 w-3 text-muted-foreground transition-transform duration-200"
          :class="layersCollapsed ? '-rotate-90' : ''"
        />
      </div>

      <!-- Collapsible body -->
      <div v-show="!layersCollapsed" class="p-3 min-w-[220px]">
        <div class="space-y-2.5">
          <div class="layer-row">
            <div class="flex items-center gap-2">
              <span class="layer-dot" style="color: hsl(var(--layer-candidate)); background: currentColor"></span>
              <span class="text-xs text-foreground/85">Candidate Buildings</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground">{{ candidateBuildingCount }}</span>
              <Switch
                v-model:checked="overlayLayers.candidateBuildings.visible"
                @update:checked="toggleCandidateBuildings"
              />
            </div>
          </div>
          <div class="layer-row">
            <div class="flex items-center gap-2">
              <span class="layer-dot" style="color: hsl(var(--layer-osm)); background: currentColor"></span>
              <span class="text-xs text-foreground/85">OSM Buildings</span>
            </div>
            <Switch v-model:checked="overlayLayers.osmBuildings.visible" @update:checked="toggleOsmBuildings" />
          </div>
        </div>

        <!-- Source dataset (single-select; compared against OSM) -->
        <div class="mt-3 pt-3 border-t border-white/[0.05]">
          <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            Source dataset
          </div>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="opt in sourceOptions"
              :key="opt.key"
              class="layer-btn flex items-center justify-center gap-1.5"
              :class="activeSource === opt.key ? 'layer-btn-active' : ''"
              :title="dataDateTitle(opt.key, opt.label)"
              @click="activeSource = activeSource === opt.key ? null : opt.key"
            >
              <span class="layer-dot" :style="{ color: `hsl(var(${opt.varName}))`, background: 'currentColor' }"></span>
              {{ opt.label }}
            </button>
          </div>
          <p class="text-[9px] text-muted-foreground/70 mt-1.5 leading-relaxed">
            One dataset at a time, compared against OSM Buildings.
          </p>
        </div>

        <!-- Base layer selection -->
        <div class="mt-3 pt-3 border-t border-white/[0.05]">
          <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Basemap</div>
          <div class="grid grid-cols-2 gap-1">
            <button
              v-for="(baselayer, key) in baselayers"
              class="layer-btn"
              :class="currentBaseLayer === key ? 'layer-btn-active' : ''"
              @click="currentBaseLayer = key"
              :title="baselayer.title"
            >
              {{ baselayer.label }} <span v-if="baselayer.comment" class="opacity-60">{{ baselayer.comment }}</span>
            </button>
          </div>
        </div>

        <div class="mt-3 pt-3 border-t border-white/[0.05] space-y-1">
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-muted-foreground">Zoom</span>
            <span class="font-mono text-foreground/55">{{ currentZoom }}</span>
          </div>
          <div class="flex items-center justify-between text-[10px]">
            <span class="text-muted-foreground">Center</span>
            <span class="font-mono text-foreground/55">
              {{ currentCenter[0].toFixed(4) }},{{ currentCenter[1].toFixed(4) }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export type SourceKind = 'grb' | 'knw' | 'picc' | 'urbis'

export interface OverlayLayers {
  candidateBuildings: { visible: boolean; ids: string[] }
  grbBuildings: { visible: boolean; ids: string[] }
  knwStructures: { visible: boolean; ids: string[] }
  osmBuildings: { visible: boolean; ids: string[] }
  osmLive: { visible: boolean; ids: string[] }
  piccBuildings: { visible: boolean; ids: string[] }
  urbisBuildings: { visible: boolean; ids: string[] }
}
</script>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { MapState } from '~/components/InteractiveMap.vue'
import { ChevronDown } from 'lucide-vue-next'
import Switch from '~/components/ui/switch.vue'

const { mapState } = defineProps<{ mapState: MapState }>()
const {
  baselayers,
  candidateBuildingCount,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  layersCollapsed,
  overlayLayers,
  activeSource
} = mapState

const sourceOptions: { key: SourceKind; label: string; varName: string }[] = [
  { key: 'grb', label: 'GRB', varName: '--layer-grb' },
  { key: 'knw', label: 'KNW', varName: '--layer-knw' },
  { key: 'picc', label: 'PICC', varName: '--layer-picc' },
  { key: 'urbis', label: 'UrbIS', varName: '--layer-urbis' }
]

const toggleCandidateBuildings = (visible: boolean) => {
  overlayLayers.value.candidateBuildings.visible = visible
}

const toggleOsmBuildings = (visible: boolean) => {
  overlayLayers.value.osmBuildings.visible = visible
}

watch(
  () => activeSource.value,
  (source) => {
    switch (source) {
      case 'grb': {
        overlayLayers.value.grbBuildings.visible = true

        // GRB, PICC, and UrbIS are mutually exclusive
        if (overlayLayers.value.grbBuildings.visible === true) {
          overlayLayers.value.knwStructures.visible = false
          overlayLayers.value.piccBuildings.visible = false
          overlayLayers.value.urbisBuildings.visible = false
        }
        break
      }
      case 'knw': {
        overlayLayers.value.knwStructures.visible = true

        // GRB, PICC, and UrbIS are mutually exclusive
        if (overlayLayers.value.knwStructures.visible === true) {
          overlayLayers.value.grbBuildings.visible = false
          overlayLayers.value.piccBuildings.visible = false
          overlayLayers.value.urbisBuildings.visible = false
        }
        break
      }
      case 'picc': {
        overlayLayers.value.piccBuildings.visible = true

        // GRB, PICC, and UrbIS are mutually exclusive
        if (overlayLayers.value.piccBuildings.visible === true) {
          overlayLayers.value.grbBuildings.visible = false
          overlayLayers.value.knwStructures.visible = false
          overlayLayers.value.urbisBuildings.visible = false
        }
        break
      }
      case 'urbis': {
        overlayLayers.value.urbisBuildings.visible = true

        // GRB, PICC, and UrbIS are mutually exclusive
        if (overlayLayers.value.urbisBuildings.visible === true) {
          overlayLayers.value.grbBuildings.visible = false
          overlayLayers.value.knwStructures.visible = false
          overlayLayers.value.piccBuildings.visible = false
        }
        break
      }
      default: {
        overlayLayers.value.grbBuildings.visible = false
        overlayLayers.value.knwStructures.visible = false
        overlayLayers.value.piccBuildings.visible = false
        overlayLayers.value.urbisBuildings.visible = false
        break
      }
    }
  }
)

// Import dates of the official datasets, shown as a tooltip on the source buttons (Issue #59)
const dataDates = ref<Partial<Record<SourceKind, string | null>>>({})
const dataDateTitle = (src: SourceKind, label: string) => {
  const iso = dataDates.value[src]
  if (!iso) return label
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return label
  return `${label} data imported on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}
const loadDataDates = async () => {
  try {
    dataDates.value = await $fetch<Record<SourceKind, string | null>>('/api/meta/data-dates')
  } catch (error) {
    console.warn('Failed to load data dates:', error)
  }
}

onMounted(() => {
  loadDataDates()
})
</script>
