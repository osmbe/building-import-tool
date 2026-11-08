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
              <Switch v-model:checked="overlayLayers.candidateBuildings" @update:checked="toggleCandidateBuildings" />
            </div>
          </div>
          <div class="layer-row">
            <div class="flex items-center gap-2">
              <span class="layer-dot" style="color: hsl(var(--layer-osm)); background: currentColor"></span>
              <span class="text-xs text-foreground/85">OSM Buildings</span>
            </div>
            <Switch v-model:checked="overlayLayers.osmBuildings" @update:checked="toggleOsmBuildings" />
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
              :class="selectedSource === opt.key ? 'layer-btn-active' : ''"
              :title="dataDateTitle(opt.key, opt.label)"
              @click="selectSource(opt.key)"
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
              @click="switchBaseLayer(key)"
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
  addresses: boolean
  boundaries: boolean
  candidateBuildings: boolean
  conflicts: boolean
  grbBuildings: boolean
  knwStructures: boolean
  osmBuildings: boolean
  piccBuildings: boolean
  urbisBuildings: boolean
}
</script>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { MapState } from '~/components/InteractiveMap.vue'
import { ChevronDown } from 'lucide-vue-next'
import Switch from '~/components/ui/switch.vue'

const { mapState } = defineProps<{ mapState: MapState }>()
const {
  baselayers,
  candidateBuildingsLayerIdRef,
  candidateBuildingCount,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  grbBuildingsLayerIdRef,
  knwStructuresLayerIdRef,
  layersCollapsed,
  liveOsmLayerIdRef,
  osmBuildingsLayerIdRef,
  overlayLayers,
  piccBuildingsLayerIdRef,
  selectedSource,
  setLayersVisibility,
  switchBaseLayer,
  urbisBuildingsLayerIdRef
} = mapState

const sourceOptions: { key: SourceKind; label: string; varName: string }[] = [
  { key: 'grb', label: 'GRB', varName: '--layer-grb' },
  { key: 'knw', label: 'KNW', varName: '--layer-knw' },
  { key: 'picc', label: 'PICC', varName: '--layer-picc' },
  { key: 'urbis', label: 'UrbIS', varName: '--layer-urbis' }
]

const toggleCandidateBuildings = (visible: boolean) => {
  overlayLayers.value.candidateBuildings = visible

  // Toggle visibility of candidate buildings layer
  setLayersVisibility(candidateBuildingsLayerIdRef.value, visible)
}

const toggleOsmBuildings = (visible: boolean) => {
  overlayLayers.value.osmBuildings = visible

  // Toggle visibility of OSM buildings layer
  const shouldShow = currentZoom.value >= 16
  setLayersVisibility(osmBuildingsLayerIdRef.value, shouldShow && visible && liveOsmLayerIdRef.value.length === 0)

  if (liveOsmLayerIdRef.value.length > 0) setLayersVisibility(liveOsmLayerIdRef.value, shouldShow && visible)
}

const selectSource = (src: SourceKind) => {
  // Clicking the active dataset turns it off; otherwise switch to it.
  const turnOn = selectedSource.value !== src
  if (src === 'grb') toggleGrbBuildings(turnOn)
  else if (src === 'knw') toggleKnwStructures(turnOn)
  else if (src === 'picc') togglePiccBuildings(turnOn)
  else toggleUrbisBuildings(turnOn)
}

const toggleGrbBuildings = (visible: boolean) => {
  overlayLayers.value.grbBuildings = visible

  const shouldShow = currentZoom.value >= 16
  setLayersVisibility(grbBuildingsLayerIdRef.value, shouldShow && visible)

  // GRB, PICC, and UrbIS are mutually exclusive
  if (visible) {
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      setLayersVisibility(knwStructuresLayerIdRef.value, false)
    }
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      setLayersVisibility(piccBuildingsLayerIdRef.value, false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      setLayersVisibility(urbisBuildingsLayerIdRef.value, false)
    }
  }
}

const toggleKnwStructures = (visible: boolean) => {
  overlayLayers.value.knwStructures = visible

  const shouldShow = currentZoom.value >= 16
  setLayersVisibility(knwStructuresLayerIdRef.value, shouldShow && visible)

  if (visible) {
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      setLayersVisibility(grbBuildingsLayerIdRef.value, false)
    }
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      setLayersVisibility(piccBuildingsLayerIdRef.value, false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      setLayersVisibility(urbisBuildingsLayerIdRef.value, false)
    }
  }
}

const togglePiccBuildings = (visible: boolean) => {
  overlayLayers.value.piccBuildings = visible

  const shouldShow = currentZoom.value >= 16
  setLayersVisibility(piccBuildingsLayerIdRef.value, shouldShow && visible)

  // GRB, PICC, and UrbIS are mutually exclusive
  if (visible) {
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      setLayersVisibility(grbBuildingsLayerIdRef.value, false)
    }
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      setLayersVisibility(knwStructuresLayerIdRef.value, false)
    }
    if (overlayLayers.value.urbisBuildings) {
      overlayLayers.value.urbisBuildings = false
      setLayersVisibility(urbisBuildingsLayerIdRef.value, false)
    }
  }
}

const toggleUrbisBuildings = (visible: boolean) => {
  overlayLayers.value.urbisBuildings = visible

  const shouldShow = currentZoom.value >= 16
  setLayersVisibility(urbisBuildingsLayerIdRef.value, shouldShow && visible)

  // GRB, PICC, and UrbIS are mutually exclusive
  if (visible) {
    if (overlayLayers.value.grbBuildings) {
      overlayLayers.value.grbBuildings = false
      setLayersVisibility(grbBuildingsLayerIdRef.value, false)
    }
    if (overlayLayers.value.knwStructures) {
      overlayLayers.value.knwStructures = false
      setLayersVisibility(knwStructuresLayerIdRef.value, false)
    }
    if (overlayLayers.value.piccBuildings) {
      overlayLayers.value.piccBuildings = false
      setLayersVisibility(piccBuildingsLayerIdRef.value, false)
    }
  }
}

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
