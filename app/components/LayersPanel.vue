<template>
  <div class="absolute bottom-4 left-4">
    <div class="glass-panel rounded-lg overflow-hidden">
      <!-- Header -->
      <div
        class="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
        :class="!layersPanelCollapsed ? 'border-b border-white/[0.05]' : ''"
        @click="layersPanelCollapsed = !layersPanelCollapsed"
      >
        <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Layers</h3>
        <ChevronDown
          class="h-3 w-3 text-muted-foreground transition-transform duration-200"
          :class="layersPanelCollapsed ? '-rotate-90' : ''"
        />
      </div>

      <!-- Collapsible body -->
      <div v-show="!layersPanelCollapsed" class="p-3 min-w-[220px]">
        <div class="space-y-2.5">
          <div class="layer-row">
            <div class="flex items-center gap-2">
              <span class="layer-dot" style="color: hsl(var(--layer-candidate)); background: currentColor"></span>
              <span class="text-xs text-foreground/85">Candidate Buildings</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-mono text-muted-foreground">{{ candidateBuildingCount }}</span>
              <Switch v-model:checked="overlayLayers.candidateBuildings.visible" />
            </div>
          </div>
          <div class="layer-row">
            <div class="flex items-center gap-2">
              <span class="layer-dot" style="color: hsl(var(--layer-osm)); background: currentColor"></span>
              <span class="text-xs text-foreground/85">OSM Buildings</span>
            </div>
            <Switch v-model:checked="overlayLayers.osmBuildings.visible" />
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

export interface OverlayLayer {
  visible: boolean
  ids: string[]
}
export interface OverlayLayers {
  candidateBuildings: OverlayLayer
  grbBuildings: OverlayLayer
  knwStructures: OverlayLayer
  osmBuildings: OverlayLayer
  osmLive: OverlayLayer
  piccBuildings: OverlayLayer
  urbisBuildings: OverlayLayer
}
</script>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ChevronDown } from 'lucide-vue-next'
import type { MapState } from '~/components/InteractiveMap.vue'
import Switch from '~/components/ui/switch.vue'
import { useLayersPanel } from '~/composables/useLayerPanel'

// Props and state for the layers panel component
const { mapState } = defineProps<{ mapState: MapState }>()

// Layers panel collapsed state
const { collapsed: layersPanelCollapsed } = useLayersPanel()

// Destructure map state for easier access within the component
const {
  baselayers,
  candidateBuildingCount,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  overlayLayers,
  activeSource
} = mapState

// Source options for the overlay layers
const sourceOptions: { key: SourceKind; label: string; varName: string }[] = [
  { key: 'grb', label: 'GRB', varName: '--layer-grb' },
  // { key: 'knw', label: 'KNW', varName: '--layer-knw' },
  { key: 'picc', label: 'PICC', varName: '--layer-picc' },
  { key: 'urbis', label: 'UrbIS', varName: '--layer-urbis' }
]

// Watch for changes in the active source and update overlay layers accordingly
watch(
  () => activeSource.value,
  (source) => {
    overlayLayers.value.grbBuildings.visible = false
    // overlayLayers.value.knwStructures.visible = false
    overlayLayers.value.piccBuildings.visible = false
    overlayLayers.value.urbisBuildings.visible = false

    switch (source) {
      case 'grb':
        overlayLayers.value.grbBuildings.visible = true
        break
      // case 'knw':
      //   overlayLayers.value.knwStructures.visible = true
      //   break
      case 'picc':
        overlayLayers.value.piccBuildings.visible = true
        break
      case 'urbis':
        overlayLayers.value.urbisBuildings.visible = true
        break
      default:
        break
    }
  }
)

// Import dates of the official datasets, shown as a tooltip on the source buttons (Issue #59)
const dataDates = ref<Partial<Record<SourceKind, string | null>>>({})
const dataDateTitle = (src: SourceKind, label: string): string => {
  const iso = dataDates.value[src]
  if (!iso) return label
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return label
  return `${label} data imported on ${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
}
const loadDataDates = async (): Promise<void> => {
  try {
    dataDates.value = await $fetch<Record<SourceKind, string | null>>('/api/meta/data-dates')
  } catch (error) {
    console.warn('Failed to load data dates:', error)
  }
}

// Load data dates when the component is mounted
onMounted(() => {
  loadDataDates()
})
</script>
