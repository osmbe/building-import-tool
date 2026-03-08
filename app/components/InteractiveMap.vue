<template>
  <div class="h-full w-full">
    <div class="h-full w-full relative">
      <!-- OpenLayers Map Container -->
      <div id="map" ref="mapRef" class="absolute inset-0" :class="currentBaseLayer === 'blank' ? 'bg-[#f5f0e8]' : ''" style="width: 100%; height: 100%; min-height: 400px;"></div>

      <!-- Top-right: Map Controls Panel -->
      <div class="absolute right-4 top-4 flex flex-col gap-2 w-44">
        <div class="glass-panel rounded-lg overflow-hidden">
          <!-- Header -->
          <div
            class="flex items-center justify-between px-2.5 py-2 cursor-pointer select-none"
            :class="!controlsCollapsed ? 'border-b border-white/[0.05]' : ''"
            @click="controlsCollapsed = !controlsCollapsed"
          >
            <span class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Controls</span>
            <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform duration-200" :class="controlsCollapsed ? '-rotate-90' : ''" />
          </div>

          <!-- Collapsible body -->
          <div v-show="!controlsCollapsed">
            <!-- Zoom controls -->
            <div class="flex items-center gap-1 p-2 border-b border-white/[0.05]">
              <button class="map-icon-btn" @click="zoomIn" title="Zoom in">
                <ZoomIn class="h-3.5 w-3.5" />
              </button>
              <button class="map-icon-btn" @click="zoomOut" title="Zoom out">
                <ZoomOut class="h-3.5 w-3.5" />
              </button>
              <button class="map-icon-btn" @click="resetView" title="Reset view">
                <RotateCcw class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Base layer selection -->
            <div class="p-2 border-b border-white/[0.05]">
              <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">Basemap</div>
              <div class="flex flex-wrap gap-1">
                <button class="layer-btn" :class="currentBaseLayer === 'blank'    ? 'layer-btn-active' : ''" @click="switchBaseLayer('blank')"    title="No background">Blank</button>
                <button class="layer-btn" :class="currentBaseLayer === 'osm'      ? 'layer-btn-active' : ''" @click="switchBaseLayer('osm')"      title="OpenStreetMap Belgium (tile.openstreetmap.be)">OSM</button>
                <button class="layer-btn" :class="currentBaseLayer === 'esri'     ? 'layer-btn-active' : ''" @click="switchBaseLayer('esri')"     title="Esri World Imagery (Maxar/Earthstar) — mosaic, dates vary by area — Belgium only">Esri</button>
                <button class="layer-btn" :class="currentBaseLayer === 'flanders' ? 'layer-btn-active' : ''" @click="switchBaseLayer('flanders')" title="Orthophoto Vlaanderen — Digitaal Vlaanderen (OFW, always latest)">Flanders <span class="opacity-60">latest</span></button>
                <button class="layer-btn" :class="currentBaseLayer === 'brussels' ? 'layer-btn-active' : ''" @click="switchBaseLayer('brussels')" title="Ortho UrbIS 2024 (nadir) — geoservices-urbis.irisnet.be">Brussels <span class="opacity-60">'24</span></button>
                <button class="layer-btn" :class="currentBaseLayer === 'wallonia' ? 'layer-btn-active' : ''" @click="switchBaseLayer('wallonia')" title="Orthophoto Wallonie 2024 — geoservices.wallonie.be">Wallonia <span class="opacity-60">'24</span></button>
              </div>
            </div>

            <!-- Actions -->
            <div class="p-2 space-y-1">
              <button
                class="action-btn w-full"
                :disabled="!canCalculateDifference || isCalculatingDifference"
                @click="calculateDifference"
              >
                <Loader2 v-if="isCalculatingDifference" class="h-3 w-3 animate-spin shrink-0" />
                <GitCompareArrows v-else class="h-3 w-3 shrink-0" />
                <span>{{ isCalculatingDifference ? 'Calculating…' : 'Get Difference' }}</span>
              </button>
              <button
                class="action-btn w-full"
                :disabled="!canExportToJOSM"
                @click="exportToJOSM"
              >
                <ExternalLink class="h-3 w-3 shrink-0" />
                <span>Open in JOSM</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-left: Layers Panel -->
      <div class="absolute bottom-4 left-4">
        <div class="glass-panel rounded-lg overflow-hidden">
          <!-- Header -->
          <div
            class="flex items-center justify-between px-3 py-2.5 cursor-pointer select-none"
            :class="!layersCollapsed ? 'border-b border-white/[0.05]' : ''"
            @click="layersCollapsed = !layersCollapsed"
          >
            <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Layers</h3>
            <ChevronDown class="h-3 w-3 text-muted-foreground transition-transform duration-200" :class="layersCollapsed ? '-rotate-90' : ''" />
          </div>

          <!-- Collapsible body -->
          <div v-show="!layersCollapsed" class="p-3 min-w-[220px]">
            <div class="space-y-2.5">
              <div class="layer-row">
                <div class="flex items-center gap-2">
                  <span class="layer-dot" style="background: #f59e0b; box-shadow: 0 0 6px #f59e0b4d;"></span>
                  <span class="text-xs text-foreground/85">Candidate Buildings</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-mono text-muted-foreground">{{ candidateBuildingCount }}</span>
                  <Switch v-model:checked="overlayLayers.candidateBuildings" @update:checked="toggleCandidateBuildings" />
                </div>
              </div>
              <div class="layer-row">
                <div class="flex items-center gap-2">
                  <span class="layer-dot" style="background: #ea580c; box-shadow: 0 0 6px #ea580c4d;"></span>
                  <span class="text-xs text-foreground/85">OSM Buildings</span>
                </div>
                <Switch v-model:checked="overlayLayers.osmBuildings" @update:checked="toggleOsmBuildings" />
              </div>
              <div class="layer-row">
                <div class="flex items-center gap-2">
                  <span class="layer-dot" style="background: #34d399; box-shadow: 0 0 6px #34d3994d;"></span>
                  <span class="text-xs text-foreground/85">GRB Buildings</span>
                </div>
                <Switch v-model:checked="overlayLayers.grbBuildings" @update:checked="toggleGrbBuildings" />
              </div>
            </div>
            <div class="mt-3 pt-3 border-t border-white/[0.05] space-y-1">
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-muted-foreground">Zoom</span>
                <span class="font-mono text-foreground/55">{{ currentZoom }}</span>
              </div>
              <div class="flex items-center justify-between text-[10px]">
                <span class="text-muted-foreground">Center</span>
                <span class="font-mono text-foreground/55">{{ currentCenter[1].toFixed(4) }}, {{ currentCenter[0].toFixed(4) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-right: Match Mode + Stats stacked -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-2 w-56">
        <!-- Matching Stats (shown after Get Difference) -->
        <div v-if="matchingStats" class="glass-panel rounded-lg p-3">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Match Stats</h3>
            <button class="text-muted-foreground hover:text-foreground transition-colors" @click="matchingStats = null">
              <X class="h-3 w-3" />
            </button>
          </div>
          <div class="space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">GRB total</span>
              <span class="font-mono text-foreground/65">{{ matchingStats.totalGrb }}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">OSM total</span>
              <span class="font-mono text-foreground/65">{{ matchingStats.totalOsm }}</span>
            </div>
            <div class="pt-2 mt-1 border-t border-white/[0.05] space-y-1.5">
              <div class="flex items-center justify-between">
                <span class="text-emerald-400/90">Matched</span>
                <span class="font-mono font-medium text-emerald-400">{{ matchingStats.matched }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sky-400/90">Unmatched</span>
                <span class="font-mono font-medium text-sky-400">{{ matchingStats.unmatched }}</span>
              </div>
            </div>
            <div class="pt-2 border-t border-white/[0.05]">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-muted-foreground">Coverage</span>
                <span class="font-mono text-primary font-medium">{{ Math.round((matchingStats.matched / matchingStats.totalGrb) * 100) }}%</span>
              </div>
              <div class="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary/75 rounded-full transition-all duration-700"
                  :style="{ width: Math.round((matchingStats.matched / matchingStats.totalGrb) * 100) + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Match Mode Control -->
        <MatchModeControl />
      </div>

      <ObjectInfoPanel :building="activeBuilding" :is-open="panelOpen" @close="panelOpen=false" @operation-complete="onOperationComplete" />

      <!-- Feature Info Panel (hover / click) -->
      <div
        v-if="hoveredFeatures.length > 0 || isTooltipSticky"
        :class="isTooltipSticky ? 'pointer-events-auto' : 'pointer-events-none'"
        class="absolute top-4 left-4 z-50 w-80"
      >
        <div class="glass-panel rounded-lg overflow-hidden">
          <template v-if="activeFeatures.length > 0">
            <!-- Feature switcher pills (shown when multiple features) -->
            <div v-if="activeFeatures.length > 1" class="flex items-center gap-1.5 px-3 pt-3 pb-1">
              <button
                v-for="(feat, idx) in activeFeatures"
                :key="idx"
                class="feature-pill"
                :class="{
                  'feature-pill--grb': feat._layer_type === 'grb',
                  'feature-pill--osm': feat._layer_type !== 'grb',
                  'feature-pill--active': idx === activeFeatureIndex
                }"
                @click="activeFeatureIndex = idx"
              >
                <span class="feature-pill__dot" />
                <span>{{ feat._layer_type === 'grb' ? 'GRB' : 'OSM' }}</span>
                <span class="opacity-50 font-mono">{{ feat._layer_type === 'grb' ? (feat.gebouw_id || feat.id) : feat.osm_id }}</span>
              </button>
              <!-- Close button -->
              <button v-if="isTooltipSticky" class="ml-auto text-muted-foreground hover:text-foreground transition-colors shrink-0" @click="closeTooltip">
                <X class="h-3.5 w-3.5" />
              </button>
            </div>

            <!-- Active feature content -->
            <div class="p-4" :key="activeFeatureIndex">
              <!-- GRB Building -->
              <template v-if="currentFeature._layer_type === 'grb'">
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded mb-1.5">
                      <Building2 class="h-2.5 w-2.5" />GRB
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">{{ formatGRBBuildingType(currentFeature.polygon_type_label || currentFeature.building_type_label) }}</h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">ID: {{ currentFeature.gebouw_id || currentFeature.id }}</div>
                  </div>
                  <button v-if="isTooltipSticky && activeFeatures.length <= 1" class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="closeTooltip">
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>

                <!-- Addresses (grouped by base address) -->
                <div v-if="currentFeature.addresses" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Addresses</div>
                  <div class="space-y-1">
                    <div v-for="(group, idx) in groupAddresses(parsePostgresArray(currentFeature.addresses))" :key="idx">
                      <div class="text-xs text-foreground font-medium">{{ group.base }}</div>
                      <div v-if="group.boxes.length > 0" class="text-[10px] text-muted-foreground mt-0.5 pl-2">
                        bus {{ group.boxes.join(', ') }}
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Location -->
                <div v-if="!currentFeature.addresses && (currentFeature.street_names || currentFeature.postcodes || currentFeature.municipalities)" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Location</div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.street_names" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Street</span>
                      <span class="text-foreground font-medium">{{ parsePostgresArray(currentFeature.street_names).join(', ') }}</span>
                    </div>
                    <div v-if="currentFeature.postcodes" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Postcode</span>
                      <span class="text-foreground font-medium">{{ parsePostgresArray(currentFeature.postcodes).join(', ') }}</span>
                    </div>
                    <div v-if="currentFeature.municipalities" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Municipality</span>
                      <span class="text-foreground font-medium">{{ parsePostgresArray(currentFeature.municipalities).join(', ') }}</span>
                    </div>
                  </div>
                </div>

                <!-- Details (only show if at least one field present) -->
                <div v-if="currentFeature.total_area_m2 || currentFeature.polygon_count || currentFeature.survey_date || currentFeature.origin_label">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Details</div>
                  <div class="space-y-1 text-xs">
                    <div v-if="currentFeature.total_area_m2" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Area</span>
                      <span class="text-foreground font-medium font-mono">{{ formatArea(currentFeature.total_area_m2) }}</span>
                    </div>
                    <div v-if="currentFeature.polygon_count" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Parts</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.polygon_count }}</span>
                    </div>
                    <div v-if="currentFeature.survey_date" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Surveyed</span>
                      <span class="text-foreground font-medium font-mono">{{ currentFeature.survey_date }}</span>
                    </div>
                    <div v-if="currentFeature.origin_label" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0">Source</span>
                      <span class="text-foreground font-medium">{{ formatOriginLabel(currentFeature.origin_label) }}</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- OSM Building -->
              <template v-else>
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <div class="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded mb-1.5">
                      <Building2 class="h-2.5 w-2.5" />OSM
                    </div>
                    <h2 class="text-sm font-semibold text-foreground">
                      {{ (currentFeature.building && currentFeature.building !== 'yes' ? currentFeature.building : null) || 'Building' }}
                    </h2>
                    <div class="text-[10px] font-mono text-muted-foreground mt-0.5">ID: {{ currentFeature.osm_id }}</div>
                  </div>
                  <button v-if="isTooltipSticky && activeFeatures.length <= 1" class="text-muted-foreground hover:text-foreground transition-colors ml-2 mt-1" @click="closeTooltip">
                    <X class="h-3.5 w-3.5" />
                  </button>
                </div>
                <!-- Grouped OSM tags -->
                <!-- Address group -->
                <div v-if="getGroupedOsmProperties(currentFeature).address.length > 0" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Address</div>
                  <div class="space-y-1 text-xs">
                    <div v-for="[key, value] in getGroupedOsmProperties(currentFeature).address" :key="key" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{ formatPropertyKey(key) }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{ formatPropertyValue(value) }}</span>
                    </div>
                  </div>
                </div>
                <!-- GRB Source group -->
                <div v-if="getGroupedOsmProperties(currentFeature).source.length > 0" class="mb-3">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">GRB Source</div>
                  <div class="space-y-1 text-xs">
                    <div v-for="[key, value] in getGroupedOsmProperties(currentFeature).source" :key="key" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{ formatPropertyKey(key) }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{ formatPropertyValue(value) }}</span>
                    </div>
                  </div>
                </div>
                <!-- Other properties -->
                <div v-if="getGroupedOsmProperties(currentFeature).other.length > 0">
                  <div class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Properties</div>
                  <div class="space-y-1 text-xs">
                    <div v-for="[key, value] in getGroupedOsmProperties(currentFeature).other" :key="key" class="flex gap-3">
                      <span class="text-muted-foreground w-20 shrink-0 truncate" :title="key">{{ formatPropertyKey(key) }}</span>
                      <span class="text-foreground font-medium font-mono truncate" :title="String(value)">{{ formatPropertyValue(value) }}</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </template>

          <!-- Footer hints -->
          <div v-if="!isTooltipSticky" class="px-4 py-2 border-t border-white/[0.05]">
            <p class="text-[9px] text-muted-foreground text-center tracking-wide">Click to pin · Esc to close</p>
          </div>
          <div v-else-if="activeFeatures.length > 1" class="px-4 py-1.5 border-t border-white/[0.05]">
            <p class="text-[9px] text-muted-foreground text-center tracking-wide">{{ activeFeatureIndex + 1 }} / {{ activeFeatures.length }} features</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Building2, ChevronDown, ExternalLink, GitCompareArrows, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { Fill, Stroke, Style } from 'ol/style'
import { GeoJSON, MVT } from 'ol/format'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { fromLonLat, toLonLat } from 'ol/proj'
import Feature from 'ol/Feature'
import MatchModeControl from '~/components/MatchModeControl.vue'
import ObjectInfoPanel from '~/components/ObjectInfoPanel.vue'
import type { BuildingData } from '~/composables/useBuildingData'
import type { SearchResult } from '~/composables/useSearch'
import Switch from '~/components/ui/switch.vue'
import VectorTileLayer from 'ol/layer/VectorTile'
import VectorTileSource from 'ol/source/VectorTile'
import { extractFeaturesFromLayer } from '~/utils/openlayers'
import { useAuth } from '~/composables/useAuth'
import { useJosmExport } from '~/composables/useJosmExport'
import { useMapLayers } from '~/composables/useMapLayers'
import { useMatchMode } from '~/composables/useMatchMode'

const { selectedLocation } = defineProps<{ selectedLocation: SearchResult | null }>()

const mapRef = ref<HTMLElement>()
const { exportLayerToJosm, testJosmConnection } = useJosmExport()
const { matchMode } = useMatchMode()

// Use the map layers composable
const {
  map,
  currentBaseLayer,
  initializeMap,
  switchBaseLayer,
  destroy
} = useMapLayers()

// OSM Buildings layer state
const osmBuildingsLayerRef = ref<any>(null)

// GRB Buildings layer state
const grbBuildingsLayerRef = ref<any>(null)
const isLoadingGRB = ref(false)

// Candidate Buildings layer state
const candidateBuildingsLayerRef = ref<any>(null)
const candidateBuildingCount = ref(0)

// Building feature info panel state
const hoveredFeatures = ref<any[]>([])
const clickedFeatures = ref<any[]>([])
const isTooltipSticky = ref(false)
const activeFeatureIndex = ref(0)

// Sorted features currently being displayed (hover or pinned)
const activeFeatures = computed(() =>
  sortFeatures(isTooltipSticky.value ? clickedFeatures.value : hoveredFeatures.value)
)

// Currently selected feature from the switcher
const currentFeature = computed(() =>
  activeFeatures.value[activeFeatureIndex.value] || activeFeatures.value[0]
)

// Reset switcher index when the feature list changes
watch(() => activeFeatures.value.length, () => {
  activeFeatureIndex.value = 0
})

const controlsCollapsed = ref(false)
const layersCollapsed = ref(false)

// Overlay layers (can be combined)
const overlayLayers = ref({
  candidateBuildings: true,
  osmBuildings: true,
  grbBuildings: false,
  conflicts: true,
  addresses: false,
  boundaries: false
})

const currentZoom = ref(8)
const currentCenter = ref<[number, number]>([4.3517, 50.8503])
const panelOpen = ref(false)
const activeBuilding = ref<BuildingData | null>(null)

// Matching stats state
const matchingStats = ref<{
  totalGrb: number
  totalOsm: number
  matched: number
  unmatched: number
} | null>(null)

// Candidate buildings state
const originalCandidateFeatures = ref<any[]>([]) // Store original features for reset
const isCalculatingDifference = ref(false) // Loading state for Get Difference button

// Computed property to check if Get Difference button should be enabled
const canCalculateDifference = computed(() => {
  // Check if map is initialized
  if (!map.value) return false

  // Check if layers are loaded
  if (!osmBuildingsLayerRef.value || !grbBuildingsLayerRef.value) return false

  // Check zoom level
  const zoom = currentZoom.value
  if (zoom < 16) return false

  // Check if layers are visible/active
  if (!overlayLayers.value.osmBuildings || !overlayLayers.value.grbBuildings) return false

  return true
})

// Computed property to check if JOSM export button should be enabled
const canExportToJOSM = computed(() =>
  // Check if there are candidate buildings
  candidateBuildingCount.value > 0
)

watch(() => selectedLocation, (loc) => {
  if (!loc || !map.value) return
  const coords = fromLonLat(loc.coordinates)
  map.value.getView().animate({
    center: coords,
    zoom: 16,
    duration: 1000
  })
})

// Watch for match mode changes and refetch candidate buildings if they're already loaded
watch(matchMode, () => {
  if (candidateBuildingsLayerRef.value) {
    // Refetch candidate buildings with the new match mode
    calculateDifference()
  }
})


const setupMap = () => {
  if (!mapRef.value) return

  // Initialize map with composable
  const mapInstance = initializeMap(mapRef.value, {
    center: [4.3517, 50.8503],
    zoom: 8
  })

  // Update reactive values when map moves
  mapInstance.on('moveend', () => {
    if (!map.value) return
    const view = map.value.getView()
    const zoom = Math.round(view.getZoom() || 13)
    currentZoom.value = zoom
    const center = view.getCenter()
    if (center) {
      const lonLat = toLonLat(center)
      currentCenter.value = [lonLat[0], lonLat[1]]
    }

    // Handle visibility of building layers based on zoom
    handleZoomBasedLayerVisibility(zoom)
  })
}

const zoomIn = () => {
  if (!map.value) return
  const view = map.value.getView()
  view.animate({
    zoom: (view.getZoom() || 13) + 1,
    duration: 250
  })
}

const zoomOut = () => {
  if (!map.value) return
  const view = map.value.getView()
  view.animate({
    zoom: (view.getZoom() || 13) - 1,
    duration: 250
  })
}

const resetView = () => {
  if (!map.value) return
  map.value.getView().animate({
    center: fromLonLat([4.3517, 50.8503]),
    zoom: 8,
    duration: 1000
  })
}


// Handle visibility of building layers based on zoom level
const handleZoomBasedLayerVisibility = (zoom: number) => {
  if (!map.value) return

  const shouldShowBuildings = zoom >= 16

  // Only show/hide existing layers, don't auto-load
  if (osmBuildingsLayerRef.value) {
    osmBuildingsLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.osmBuildings)
  }
  if (grbBuildingsLayerRef.value) {
    grbBuildingsLayerRef.value.setVisible(shouldShowBuildings && overlayLayers.value.grbBuildings)
  }
}


// Handle Load OSM Buildings using Vector Tiles from Martin
const handleLoadOSM = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing OSM buildings layer if present
    if (osmBuildingsLayerRef.value) {
      map.value.removeLayer(osmBuildingsLayerRef.value)
    }

    // Create vector tile source for OSM buildings
    const osmTileSource = new VectorTileSource({
      format: new MVT(),
      url: '/tiles/osm/osm_buildings/{z}/{x}/{y}',
      minZoom: 10,
      maxZoom: 18,
      attributions: '© OpenStreetMap contributors'
    })

    // Style function for OSM buildings
    const osmStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')
      const source = feature.get('source') || ''

      // OSM features: 10% fill opacity, 100% border opacity
      let fillColor = 'rgba(234, 88, 12, 0.1)' // Orange with 10% opacity
      let strokeColor = 'rgba(234, 88, 12, 1.0)' // Orange with 100% opacity

      if (source.includes('Gbg')) {
        fillColor = 'rgba(34, 197, 94, 0.1)' // Green for GRB-sourced with 10% opacity
        strokeColor = 'rgba(34, 197, 94, 1.0)' // Green with 100% opacity
      }

      // Hover effect
      if (isHovered) {
        fillColor = 'rgba(234, 88, 12, 0.3)'
        strokeColor = 'rgba(251, 146, 60, 1)'
      }

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : 2
        })
      })
    }

    // Create vector tile layer
    const osmTileLayer = new VectorTileLayer({
      source: osmTileSource,
      style: osmStyleFunction,
      zIndex: 9,
      properties: {
        title: 'OSM Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map
    osmBuildingsLayerRef.value = osmTileLayer
    map.value.addLayer(osmTileLayer)

    // Update UI state
    overlayLayers.value.osmBuildings = true

    // Set initial visibility based on current zoom level
    const currentZoomLevel = Math.round(map.value.getView().getZoom() || 13)
    const shouldShow = currentZoomLevel >= 16 && overlayLayers.value.osmBuildings
    osmTileLayer.setVisible(shouldShow)
  } catch (error) {
    console.error('Failed to load OSM buildings:', error)
  }
}

// Handle Load GRB Buildings using Vector Tiles
const handleLoadGRB = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    isLoadingGRB.value = true

    // Remove existing GRB buildings layer if present
    if (grbBuildingsLayerRef.value) {
      map.value.removeLayer(grbBuildingsLayerRef.value)
    }

    // Create vector tile source for GRB buildings
    const grbTileSource = new VectorTileSource({
      format: new MVT(),
      url: '/tiles/grb/buildings/{z}/{x}/{y}',
      minZoom: 10,
      maxZoom: 18,
      attributions: '© GRB Buildings'
    })

    // Style function for GRB buildings
    const grbStyleFunction = (feature: any) => {
      const isHovered = feature.get('hovered')
      const buildingType = feature.get('building_type')
      const surfaceArea = feature.get('surface_area') || 0

      // GRB features: 80% fill opacity, 10% border opacity
      let fillColor = 'rgba(34, 197, 94, 0.8)' // Green with 80% opacity
      if (buildingType === 'house') {
        fillColor = 'rgba(34, 197, 94, 0.8)'
      } else if (buildingType === 'shed') {
        fillColor = 'rgba(22, 163, 74, 0.8)'
      }

      let strokeColor = 'rgba(34, 197, 94, 0.1)' // Green with 10% opacity

      // Hover effect
      if (isHovered) {
        fillColor = 'rgba(34, 197, 94, 0.9)'
        strokeColor = 'rgba(74, 222, 128, 1)'
      }

      // Stroke width based on surface area
      const strokeWidth = surfaceArea > 200 ? 2 : 1.5

      return new Style({
        fill: new Fill({
          color: fillColor
        }),
        stroke: new Stroke({
          color: strokeColor,
          width: isHovered ? 3 : strokeWidth,
          lineDash: [5, 5]
        })
      })
    }

    // Create vector tile layer
    const grbTileLayer = new VectorTileLayer({
      source: grbTileSource,
      style: grbStyleFunction,
      zIndex: 10,
      properties: {
        title: 'GRB Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map
    grbBuildingsLayerRef.value = grbTileLayer
    map.value.addLayer(grbTileLayer)

    // Update UI state
    overlayLayers.value.grbBuildings = true

    // Set initial visibility based on current zoom level
    const currentZoomLevel = Math.round(map.value.getView().getZoom() || 13)
    const shouldShow = currentZoomLevel >= 16 && overlayLayers.value.grbBuildings
    grbTileLayer.setVisible(shouldShow)
  } catch (error) {
    console.error('Failed to load GRB buildings:', error)
  } finally {
    isLoadingGRB.value = false
  }
}


// Layer toggle functions (kept for layer panel compatibility)

const toggleCandidateBuildings = (visible: boolean) => {
  overlayLayers.value.candidateBuildings = visible

  // Toggle visibility of candidate buildings layer
  if (candidateBuildingsLayerRef.value) {
    candidateBuildingsLayerRef.value.setVisible(visible)
  }
}

const toggleOsmBuildings = (visible: boolean) => {
  overlayLayers.value.osmBuildings = visible

  // Toggle visibility of OSM buildings layer
  if (osmBuildingsLayerRef.value) {
    osmBuildingsLayerRef.value.setVisible(visible)
  }
}

const toggleGrbBuildings = (visible: boolean) => {
  overlayLayers.value.grbBuildings = visible

  // Toggle visibility of loaded GRB buildings layer
  if (grbBuildingsLayerRef.value) {
    grbBuildingsLayerRef.value.setVisible(visible)
  }
}

// Helper function to calculate polygon centroid
const getPolygonCentroid = (coords: [number, number][]): [number, number] => {
  if (!coords || coords.length === 0) return [0, 0]
  let x = 0, y = 0
  for (const coord of coords) {
    x += coord[0]
    y += coord[1]
  }
  return [x / coords.length, y / coords.length]
}

// Helper function to check if a point is inside a polygon (ray casting algorithm)
const pointInPolygon = (point: [number, number], polygon: [number, number][]): boolean => {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect) inside = !inside
  }

  return inside
}

// Helper function to check if two polygons overlap significantly
const polygonsOverlap = (grbCoords: [number, number][], osmCoords: [number, number][]): boolean => {
  // Check if any GRB vertex is inside OSM polygon
  for (const coord of grbCoords) {
    if (pointInPolygon(coord, osmCoords)) {
      return true
    }
  }

  // Check if any OSM vertex is inside GRB polygon
  for (const coord of osmCoords) {
    if (pointInPolygon(coord, grbCoords)) {
      return true
    }
  }

  return false
}

// Helper function to check if a GRB feature has a matching OSM feature
const hasMatchingOSMFeature = (grbFeature: any, osmFeatures: any[]): boolean => {
  const grbGeom = grbFeature.geometry
  if (!grbGeom || !grbGeom.coordinates || grbGeom.type !== 'Polygon') return false

  const [grbCoords] = grbGeom.coordinates // exterior ring

  // Check if any OSM feature overlaps with this GRB feature
  for (const osmFeature of osmFeatures) {
    const osmSource = osmFeature.properties?.source || ''

    // Skip OSM features that already have GRB as source
    if (osmSource.includes('Gbg')) {
      continue
    }

    // Check OSM geometry
    const osmGeom = osmFeature.geometry
    if (!osmGeom || !osmGeom.coordinates || osmGeom.type !== 'Polygon') continue

    const [osmCoords] = osmGeom.coordinates // exterior ring

    // Check if polygons overlap
    if (polygonsOverlap(grbCoords, osmCoords)) {
      return true
    }
  }

  return false
}

// Helper function to convert flat coordinates array to GeoJSON rings format
const convertFlatCoordinatesToRings = (flatCoords: number[], geometryType: string): any[] => {
  if (!flatCoords || flatCoords.length === 0) return []

  // Group coordinates into pairs [x, y]
  const coords: [number, number][] = []
  for (let i = 0; i < flatCoords.length; i += 2) {
    if (i + 1 < flatCoords.length) {
      coords.push([flatCoords[i], flatCoords[i + 1]])
    }
  }

  // For polygons, wrap coordinates in an array (exterior ring)
  if (geometryType === 'Polygon' || geometryType === 1) {
    return [coords]
  }

  // For other types, return as is
  return coords as any
}

// Helper function to check if a feature's geometry is within the map extent
const isFeatureInExtent = (geometry: any, extent: number[]): boolean => {
  if (!geometry || !geometry.coordinates) return false

  // Get bounding box of geometry
  let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity

  const coords = geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.coordinates

  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  // Check if bounding box intersects with extent
  // extent = [minX, minY, maxX, maxY]
  return !(maxX < extent[0] || minX > extent[2] || maxY < extent[1] || minY > extent[3])
}

// Helper function to calculate polygon area using shoelace formula
const getPolygonArea = (coords: [number, number][]): number => {
  if (!coords || coords.length < 3) return 0

  let area = 0
  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1]
  }
  // Close the polygon
  area += coords[coords.length - 1][0] * coords[0][1] - coords[0][0] * coords[coords.length - 1][1]

  return Math.abs(area) / 2
}

// Helper function to check if a polygon is contained within another
const isPolygonContainedInOther = (polygon1: any, otherPolygons: any[]): boolean => {
  const coords1 = polygon1.geometry?.coordinates?.[0]
  if (!coords1) return false

  const area1 = getPolygonArea(coords1)
  const minAreaRatio = 0.3 // If feature is less than 30% of another feature, it's likely contained

  for (const otherPoly of otherPolygons) {
    const coords2 = otherPoly.geometry?.coordinates?.[0]
    if (!coords2 || coords2 === coords1) continue

    const area2 = getPolygonArea(coords2)

    // Check if all vertices of polygon1 are inside polygon2
    const allInside = coords1.every(coord => pointInPolygon(coord, coords2))

    // If all vertices are inside AND polygon1 is much smaller, it's contained
    if (allInside && area1 < area2 * minAreaRatio) {
      return true
    }
  }

  return false
}

// Helper function to get bounding box of a polygon
const getBoundingBox = (coords: [number, number][]): [number, number, number, number] => {
  if (!coords || coords.length === 0) return [0, 0, 0, 0]
  let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

// Helper function to check if two bounding boxes overlap or are very close
const boundingBoxesIntersect = (bbox1: [number, number, number, number], bbox2: [number, number, number, number], tolerance = 5): boolean =>
  // tolerance in map units (meters in EPSG:31370)
  !(bbox1[2] + tolerance < bbox2[0] || bbox1[0] - tolerance > bbox2[2] || bbox1[3] + tolerance < bbox2[1] || bbox1[1] - tolerance > bbox2[3])

// Helper function to merge polygon fragments properly
// Combines all coordinates from fragments and reconstructs the polygon
const mergePolygonFragments = (polygons: [number, number][][]): [number, number][] => {
  if (polygons.length === 0) return []
  if (polygons.length === 1) return polygons[0]

  // For 2+ fragments, combine all unique coordinates and reconstruct
  // The key insight: vector tile fragments overlap at boundaries,
  // so combining all points gives us the complete building outline
  const allCoords: [number, number][] = []

  for (const polygon of polygons) {
    allCoords.push(...polygon)
  }

  // Remove duplicate/very close coordinates (within 0.01 units)
  const uniqueCoords: [number, number][] = []
  for (const coord of allCoords) {
    const isDuplicate = uniqueCoords.some(
      existing => Math.abs(existing[0] - coord[0]) < 0.01 && Math.abs(existing[1] - coord[1]) < 0.01
    )
    if (!isDuplicate) {
      uniqueCoords.push(coord)
    }
  }

  if (uniqueCoords.length < 3) return polygons[0]

  // Use Concave Hull (radial sweep) to order points while preserving concavity
  // This is more accurate than angle-from-centroid for concave shapes
  const ordered = concaveHull(uniqueCoords)

  return ordered.length >= 3 ? ordered : polygons[0]
}

// Concave hull algorithm - orders points to form a polygon preserving concavity
const concaveHull = (points: [number, number][]): [number, number][] => {
  if (points.length <= 3) return points

  // Find the leftmost point
  let [leftmost] = points
  let leftmostIdx = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i][0] < leftmost[0]) {
      leftmost = points[i]
      leftmostIdx = i
    }
  }

  // Gift wrapping (Jarvis march) algorithm adapted for concave hulls
  const hull: [number, number][] = []
  let current = leftmostIdx
  let previous = -1

  do {
    hull.push(points[current])
    let next = 0

    for (let i = 0; i < points.length; i++) {
      if (i === current || i === previous) continue

      const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

      const curr = points[current]
      const nxt = points[next]
      const candidate = points[i]

      if (next === previous) {
        next = i
      } else {
        const crossProduct = cross(curr, nxt, candidate)
        if (crossProduct > 0) {
          next = i
        }
      }
    }

    previous = current
    current = next
  } while (current !== leftmostIdx && current !== 0 && hull.length < points.length + 5)

  return hull
}

// Merge fragmented building features that span multiple tiles
// Strategy: Group by ID first (matching fragments), then merge by combining coordinates
const mergeFragmentedBuildings = (features: any[]): any[] => {
  if (features.length <= 1) return features

  const merged: any[] = []
  const processed = new Set<number>()
  const tolerance = 5 // meters in EPSG:31370 - tolerance for considering features as fragments of same building

  for (let i = 0; i < features.length; i++) {
    if (processed.has(i)) continue

    const feature = features[i]
    const coords = feature.geometry?.coordinates?.[0]
    if (!coords) {
      merged.push(feature)
      processed.add(i)
      continue
    }

    // Find all features that should be merged with this one
    const featureId = feature.properties?.id
    const bbox1 = getBoundingBox(coords)
    const fragmentsToMerge = [{ coords, properties: feature.properties }]

    for (let j = i + 1; j < features.length; j++) {
      if (processed.has(j)) continue

      const otherFeature = features[j]
      const otherCoords = otherFeature.geometry?.coordinates?.[0]
      if (!otherCoords) continue

      const otherFeatureId = otherFeature.properties?.id

      // First priority: merge by ID if both have IDs and they match
      if (featureId && otherFeatureId && featureId === otherFeatureId) {
        fragmentsToMerge.push({ coords: otherCoords, properties: otherFeature.properties })
        processed.add(j)
      } else if (!featureId && !otherFeatureId) {
        // If neither has ID, merge by proximity
        const bbox2 = getBoundingBox(otherCoords)
        if (boundingBoxesIntersect(bbox1, bbox2, tolerance)) {
          fragmentsToMerge.push({ coords: otherCoords, properties: otherFeature.properties })
          processed.add(j)
        }
      }
      // Don't merge if one has ID and the other doesn't, or if IDs don't match
    }

    processed.add(i)

    // Merge all found fragments
    if (fragmentsToMerge.length > 1) {
      const coordsToMerge = fragmentsToMerge.map(f => f.coords)
      // Merge all fragments by combining coordinates and reconstructing polygon
      const mergedCoords = mergePolygonFragments(coordsToMerge)
      merged.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [mergedCoords]
        },
        properties: feature.properties || {}
      })
    } else {
      merged.push(feature)
    }
  }

  return merged
}

// Calculate difference between GRB and OSM buildings and display them
const calculateDifference = async () => {
  if (!map.value) return

  // Check if layers are loaded
  if (!osmBuildingsLayerRef.value || !grbBuildingsLayerRef.value) {
    alert('Please load both OSM and GRB building layers first.')
    return
  }

  // Check zoom level
  const view = map.value.getView()
  const zoom = view.getZoom() || 13
  const roundedZoom = Math.round(zoom)
  if (roundedZoom < 16) {
    alert(`Please zoom in to at least level 16 to calculate differences.\n\nCurrent zoom: ${roundedZoom}`)
    return
  }

  // Check if layers are visible/active
  if (!overlayLayers.value.osmBuildings || !overlayLayers.value.grbBuildings) {
    alert('Please enable both OSM Buildings and GRB Buildings layers first.')
    return
  }

  // Set loading state
  isCalculatingDifference.value = true

  try {
    // Get map extent in Web Mercator (EPSG:3857)
    const mapExtent = map.value.getView().calculateExtent(map.value.getSize())

    // Send Web Mercator bounds to API - PostGIS will handle transformation
    const bounds = [mapExtent[0], mapExtent[1], mapExtent[2], mapExtent[3]]

    // Call backend API to calculate difference
    const response = await $fetch('/api/buildings/difference', {
      method: 'POST',
      body: { bounds, matchMode: matchMode.value }
    })

    const candidateGeoJSON = response as any

    if (!candidateGeoJSON || candidateGeoJSON.features.length === 0) {
      alert('No buildings to show difference.\n\nAll GRB buildings have matching OSM geometries or the area has no data.')

      // Remove existing candidate buildings layer if present
      if (candidateBuildingsLayerRef.value) {
        map.value.removeLayer(candidateBuildingsLayerRef.value)
        candidateBuildingsLayerRef.value = null
      }

      matchingStats.value = null
      candidateBuildingCount.value = 0
      return
    }

    // Update matching stats
    const stats = (candidateGeoJSON as any).stats || {}
    matchingStats.value = {
      totalGrb: stats.totalGrb || candidateGeoJSON.features.length,
      totalOsm: stats.totalOsm || 0,
      matched: (stats.totalGrb || 0) - candidateGeoJSON.features.length,
      unmatched: candidateGeoJSON.features.length
    }

    // Update candidate building count
    candidateBuildingCount.value = candidateGeoJSON.features.length

    // Store original features for simplification
    originalCandidateFeatures.value = candidateGeoJSON.features

    // Remove existing candidate buildings layer if present
    if (candidateBuildingsLayerRef.value) {
      map.value.removeLayer(candidateBuildingsLayerRef.value)
    }

    // Import OpenLayers modules
    const { default: VectorLayer } = await import('ol/layer/Vector')
    const { default: VectorSource } = await import('ol/source/Vector')
    const { default: GeoJSONFormat } = await import('ol/format/GeoJSON')

    console.log('Candidate features loaded:', candidateGeoJSON.features.length)

    // Parse GeoJSON and create source
    const geoJsonFormat = new GeoJSONFormat()
    const features = geoJsonFormat.readFeatures(candidateGeoJSON, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    })

    const candidateSource = new VectorSource({ features })

    // Style function for candidate buildings
    const candidateStyleFunction = () => new Style({
      fill: new Fill({
        color: 'rgba(251, 146, 60, 0.4)' // Orange with 40% opacity
      }),
      stroke: new Stroke({
        color: 'rgba(251, 146, 60, 1.0)', // Orange with 100% opacity
        width: 2
      })
    })

    // Create vector layer for candidate buildings
    const candidateLayer = new VectorLayer({
      source: candidateSource,
      style: candidateStyleFunction,
      zIndex: 11,
      properties: {
        title: 'Candidate Buildings',
        type: 'overlay'
      }
    })

    // Add layer to map
    candidateBuildingsLayerRef.value = candidateLayer
    map.value.addLayer(candidateLayer)

    // Enable candidate buildings layer
    overlayLayers.value.candidateBuildings = true

  } catch (error) {
    console.error('Error calculating difference:', error)
    alert(`Error calculating difference:\n\n${error instanceof Error ? error.message : String(error)}`)
  } finally {
    // Reset loading state
    isCalculatingDifference.value = false
  }
}

const exportToJOSM = async () => {
  if (!map.value) return

  // Check if we have candidate buildings data
  if (originalCandidateFeatures.value.length === 0) {
    alert('No candidate buildings to export.\n\nPlease click "Get Difference" first to calculate candidate buildings.')
    return
  }

  try {
    // Check JOSM connection first
    const isConnected = await testJosmConnection()
    if (!isConnected) {
      alert('JOSM is not running or remote control is disabled.\n\nPlease:\n1. Start JOSM\n2. Go to Edit → Preferences (F12)\n3. Enable "Remote Control"\n4. Click OK')
      return
    }

    // Use ALL features from the original API response (not just visible ones)
    // This ensures we export everything from "Get Difference", not just what's in viewport
    const allFeatures = originalCandidateFeatures.value

    if (allFeatures.length === 0) {
      alert('No buildings to export.')
      return
    }

    console.log(`Exporting ${allFeatures.length} candidate buildings to JOSM`)

    // Export to JOSM - ALL features from the candidate layer
    const result = await exportLayerToJosm(
      allFeatures,
      'GRB Candidate Buildings',
      {
        includeMeta: false,
        simplify: false,
        uploadToBackend: false
      }
    )

    console.log('✅ Export successful')
    alert(`Candidate buildings exported to JOSM successfully!\n\nExported ${result.featureCount} building${result.featureCount === 1 ? '' : 's'}.\n\nThe buildings have been loaded in JOSM as a new layer.`)
  } catch (error: any) {
    console.error('Error exporting candidate buildings to JOSM:', error)
    alert(`Error exporting to JOSM:\n\n${error.message}\n\nPlease check:\n1. JOSM is running with remote control enabled\n2. Port 8111 is not blocked by firewall\n3. Network connectivity`)
  }
}

const onOperationComplete = (res: any) => {
  // Handle operation completion
  console.log('Operation completed:', res)
}

// Remove a specific feature from the clicked features array
const removeFeature = (index: number) => {
  clickedFeatures.value.splice(index, 1)

  // If no features left, close the panel
  if (clickedFeatures.value.length === 0) {
    closeTooltip()
  }
}

// Close tooltip function
const closeTooltip = () => {
  isTooltipSticky.value = false
  clickedFeatures.value = []
  hoveredFeatures.value = []
  activeFeatureIndex.value = 0
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

    for (const char of inner) {
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

  // Handle '; '-separated strings (STRING_AGG with '; ' separator, e.g. addresses column)
  if (str.includes('; ')) {
    return str.split('; ').map(s => s.trim()).filter(Boolean)
  }

  return [str]
}

// Group addresses that share the same base address, collapsing box numbers
// e.g. ["Boekfos 49, 1730 Asse", "Boekfos 49 bus 1, 1730 Asse", "Boekfos 49 bus 2, 1730 Asse"]
//   → [{ base: "Boekfos 49, 1730 Asse", boxes: ["1", "2"] }]
interface GroupedAddress { base: string; boxes: string[] }
const groupAddresses = (addresses: string[]): GroupedAddress[] => {
  // Pattern: "<street> <number> bus <box>, <postcode> <city>"
  const busPattern = /^(.+?)\s+bus\s+(.+?),\s*(.+)$/i
  const groups = new Map<string, string[]>()
  const order: string[] = []

  for (const addr of addresses) {
    const match = addr.match(busPattern)
    if (match) {
      const base = `${match[1]}, ${match[3]}`
      if (!groups.has(base)) {
        groups.set(base, [])
        order.push(base)
      }
      groups.get(base)!.push(match[2])
    } else {
      // No bus number — standalone address
      if (!groups.has(addr)) {
        groups.set(addr, [])
        order.push(addr)
      }
    }
  }

  // Sort box numbers naturally (1, 2, 3, ... 10, 11 instead of 1, 10, 11, 2)
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

  return order.map(base => ({
    base,
    boxes: groups.get(base)!.sort(collator.compare)
  }))
}

// Helper function to format area
const formatArea = (area: number): string => {
  if (!area) return '—'
  if (area >= 1000) {
    return `${(area / 1000).toFixed(2)} km²`
  }
  return `${area.toFixed(0)} m²`
}

// Helper function to translate GRB building types
const formatGRBBuildingType = (type: string | undefined): string => {
  if (!type) return 'Building'

  const translations: Record<string, string> = {
    'hoofdgebouw': 'Main Building',
    'bijgebouw': 'Outbuilding',
    'afdak': 'Shelter',
    'garage': 'Garage',
    'berging': 'Storage',
    'serre': 'Conservatory',
    'ingezonken garagetoegang': 'Sunken Garage Entrance',
    'verdieping': 'Upper Floor',
    'trap': 'Staircase',
    'zichtbare onderkeldering': 'Visible Basement',
    'gebouw afgezoomd met virtuele gevels': 'Building with Virtual Facades',
    'verheven garagetoegang': 'Elevated Garage Entrance',
    'loopbrug': 'Walkway'
  }

  return translations[type.toLowerCase()] || type
}

// Helper function to translate GRB origin labels (Dutch to English)
const formatOriginLabel = (label: string | undefined): string => {
  if (!label) return ''
  const translations: Record<string, string> = {
    'terreinbezoek': 'Field Survey',
    'as-built plan': 'As-Built Plan',
    'gemeentelijk as-built plan': 'Municipal As-Built Plan',
    'fotogrammetrisch': 'Photogrammetry',
    'luchtfoto': 'Aerial Photo',
    'gedigitaliseerd': 'Digitized',
    'niet gekend': 'Unknown',
    'andere': 'Other'
  }
  return translations[label.toLowerCase()] || label
}

// Group OSM properties into address, source:geometry, and other
const getGroupedOsmProperties = (feature: any): { address: [string, any][], source: [string, any][], other: [string, any][] } => {
  const all = getDisplayableProperties(feature)
  const address: [string, any][] = []
  const source: [string, any][] = []
  const other: [string, any][] = []

  for (const [key, value] of all) {
    if (key.startsWith('addr:') || key.startsWith('addr_')) {
      address.push([key, value])
    } else if (key.startsWith('source:geometry:') || key === 'source:geometry') {
      source.push([key, value])
    } else {
      other.push([key, value])
    }
  }

  return { address, source, other }
}

// Helper function to sort features - GRB first, then OSM
const sortFeatures = (features: any[]): any[] => [...features].sort((a, b) => {
  // GRB features (_layer_type === 'grb') come first
  if (a._layer_type === 'grb' && b._layer_type !== 'grb') return -1
  if (a._layer_type !== 'grb' && b._layer_type === 'grb') return 1
  return 0
})

// Helper function to parse PostgreSQL hstore tags format
const parseHstoreTags = (tagsString: string): Record<string, string> => {
  const tags: Record<string, string> = {}

  // Parse hstore format: "key"=>"value", "key2"=>"value2"
  const regex = /"([^"]+)"=>"([^"]*)"/g
  let match

  while ((match = regex.exec(tagsString)) !== null) {
    const [, key, value] = match
    tags[key] = value
  }

  return tags
}

// Property mapping for GRB features (Dutch to English)
const grbPropertyMapping: Record<string, string | null> = {
  // Map to English
  'BEGINDATUM': 'begin_date',
  'VERSDATUM': 'version_date',
  'LBLBGNINV': 'source_inventory_label',
  'BGNINV': 'source_inventory',

  // Keep important fields
  'source': 'source',
  'source_dataset': 'source_dataset',
  'source_geometry': 'source_geometry',
  'source_geometry_date': 'source_geometry_date',
  'source_geometry_entity': 'source_geometry_entity',
  'postal_code': 'postal_code',
  'building_type': 'building_type',

  // Filter out duplicates and noise
  'begin date': null,
  'version date': null,
  'source inventory': null,
  'source inventory label': null,
  'imported at': null,
  'updated at': null,
  'source_geometry_version': null,
  'importedAt': null,
  'updatedAt': null
}

// Property display names (for formatting)
const propertyDisplayNames: Record<string, string> = {
  'begin_date': 'Begin Date',
  'version_date': 'Version Date',
  'source_inventory': 'Inventory',
  'source_inventory_label': 'Inventory Label',
  'source_dataset': 'Dataset',
  'source_geometry': 'Geometry Source',
  'source_geometry_date': 'Geometry Date',
  'source_geometry_entity': 'Entity',
  'postal_code': 'Postal Code',
  'building_type': 'Building Type',
  'source': 'Source',
  'name': 'Name',
  'addr_street': 'Street',
  'addr_housenumber': 'House Number',
  'building': 'Building'
}

// Helper functions for tooltip display
const getDisplayableProperties = (feature: any) => {
  if (!feature) return []

  const isGrb = feature._layer_type === 'grb'
  const isOsm = feature._layer_type === 'osm'

  // Properties to exclude from display (internal or already shown)
  const excludedProps = ['geometry', 'osm_id', 'osm_type', 'hovered', 'id', 'grbid', '_layer_type', 'tags', 'layer', 'extent', 'type']

  const properties: [string, any][] = []

  // First, add all regular properties (including source)
  Object.entries(feature)
    .filter(([key, value]) =>
      // Exclude internal properties and empty values
      !excludedProps.includes(key) &&
             value !== null &&
             value !== undefined &&
             value !== ''
    )
    .forEach(([key, value]) => {
      // Apply GRB mapping if it's a GRB feature
      if (isGrb && Object.hasOwn(grbPropertyMapping, key)) {
        const mappedKey = grbPropertyMapping[key]
        if (mappedKey !== null) {
          properties.push([mappedKey, value])
        }
        // If mapped to null, skip this property
      } else if (!isGrb || !Object.keys(grbPropertyMapping).some(k => k.toLowerCase() === key.toLowerCase())) {
        // For OSM features or unmapped GRB properties, include them
        properties.push([key, value])
      }
    })

  // Parse and add tags if they exist (PostgreSQL hstore format or JSONB object)
  if (feature.tags) {
    let parsedTags: any = {}

    if (typeof feature.tags === 'string') {
      // Parse hstore string format
      parsedTags = parseHstoreTags(feature.tags)
    } else if (typeof feature.tags === 'object' && feature.tags !== null) {
      // Already an object (JSONB from vector tiles)
      parsedTags = feature.tags
    }

    // For OSM features, show all tags
    Object.entries(parsedTags)
      .filter(([, value]) =>
        value !== null &&
               value !== undefined &&
               value !== ''
      )
      .forEach(([key, value]) => {
        properties.push([key, value])
      })
  }

  // Sort alphabetically
  const sorted = properties.sort(([a], [b]) => a.localeCompare(b))

  // Remove duplicates based on actual key names and formatted names
  const seenKeys = new Set<string>()
  const seenFormattedKeys = new Set<string>()
  const uniqueProperties: [string, any][] = []

  for (const [key, value] of sorted) {
    const normalizedKey = key.toLowerCase()
    const formattedKey = formatPropertyKey(key)

    if (!seenKeys.has(normalizedKey) && !seenFormattedKeys.has(formattedKey)) {
      seenKeys.add(normalizedKey)
      seenFormattedKeys.add(formattedKey)
      uniqueProperties.push([key, value])
    }
  }

  return uniqueProperties
}

const formatPropertyKey = (key: string) => {
  // Check if we have a custom display name
  if (propertyDisplayNames[key]) {
    return propertyDisplayNames[key]
  }

  // Convert underscores to spaces and handle special cases
  return key
    .replace(/_/g, ' ')
    .replace(/:/g, ' ')
    .replace(/addr /g, '')
    .replace(/building /g, '')
    .trim()
}

// Helper to format a valid Date as a localized string
const formatDateValue = (date: Date, includeTime: boolean): string => {
  if (includeTime) {
    return new Intl.DateTimeFormat('nl-BE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(date)
  }
  return new Intl.DateTimeFormat('nl-BE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

const formatPropertyValue = (value: any): string => {
  if (value === null || value === undefined) {
    return ''
  }

  // Try to parse as date/datetime
  if (typeof value === 'string') {
    // Check if it looks like a date (YYYY-MM-DD or ISO datetime)
    const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dateMatch) {
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
  }

  return String(value)
}

// Setup hover interaction for building features
const setupHoverInteraction = () => {
  if (!map.value) return

  let currentHoveredFeatureObj: any = null
  const hoverTimeout: any = null
  let debounceTimeout: any = null

  // Add click interaction for sticky tooltip
  map.value.on('click', (evt) => {
    if (!map.value) return

    const pixel = map.value.getEventPixel(evt.originalEvent)

    const foundFeatures: any[] = []
    map.value.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (layer === osmBuildingsLayerRef.value || layer === grbBuildingsLayerRef.value) {
        // Get properties for clicked feature
        let properties: any
        try {
          if (feature instanceof Feature) {
            properties = feature.getProperties()
          } else if (feature.getProperties) {
            properties = feature.getProperties()
          } else if (feature.values_) {
            properties = feature.values_
          } else {
            properties = feature
          }
        } catch (error) {
          console.warn('Error getting clicked feature properties:', error)
          properties = {}
        }

        // Extract feature ID and add it to properties
        const featureId = feature.getId ? feature.getId() : (feature.id_ || null)
        if (featureId) {
          if (layer === osmBuildingsLayerRef.value) {
            properties.osm_id = featureId
          } else {
            properties.id = featureId
          }
        }

        // Add layer type to distinguish OSM from GRB features
        properties._layer_type = layer === osmBuildingsLayerRef.value ? 'osm' : 'grb'

        foundFeatures.push(properties)
      }
      return false // Continue to collect all features
    }, {
      hitTolerance: 3
    })

    if (foundFeatures.length > 0) {
      // Make tooltip sticky with all found features
      clickedFeatures.value = foundFeatures
      isTooltipSticky.value = true
    } else {
      // Clicked outside features, close sticky tooltip
      closeTooltip()
    }
  })

  map.value.on('pointermove', (evt) => {
    if (!map.value) {
      return
    }

    // Debounce to reduce canvas read operations
    if (debounceTimeout) {
      clearTimeout(debounceTimeout)
    }

    debounceTimeout = setTimeout(() => {
      if (!map.value) return

      const pixel = map.value.getEventPixel(evt.originalEvent)

      // Only update cursor if not sticky
      if (!isTooltipSticky.value) {
        // No position tracking needed for fixed panel
      }

      // Clear previous hover state (only if not sticky)
    if (currentHoveredFeatureObj && !isTooltipSticky.value) {
      try {
        if (currentHoveredFeatureObj instanceof Feature) {
          currentHoveredFeatureObj.set('hovered', false)
        }
      } catch (error) {
        // Ignore errors when clearing hover state
      }
      currentHoveredFeatureObj = null
      hoveredFeatures.value = []
      if (map.value) {
        map.value.getTargetElement().style.cursor = ''
      }
    }

    // Check if we're hovering over features from building layers (collect all)
    const foundFeatures: any[] = []
    let firstFeature: any = null

    map.value.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (layer === osmBuildingsLayerRef.value || layer === grbBuildingsLayerRef.value) {
        if (!firstFeature) {
          firstFeature = feature
        }

        // Get properties - handle both regular features and vector tile features
        let properties: any
        try {
          if (feature instanceof Feature) {
            properties = feature.getProperties()
          } else if (feature.getProperties) {
            properties = feature.getProperties()
          } else if (feature.values_) {
            // Vector tile features store properties in values_
            properties = feature.values_
          } else {
            properties = feature
          }
        } catch (error) {
          console.warn('Error getting feature properties:', error)
          properties = {}
        }

        // Extract feature ID and add it to properties
        const featureId = feature.getId ? feature.getId() : (feature.id_ || null)
        if (featureId) {
          if (layer === osmBuildingsLayerRef.value) {
            properties.osm_id = featureId
          } else {
            properties.id = featureId
          }
        }

        // Add layer type to distinguish OSM from GRB features
        properties._layer_type = layer === osmBuildingsLayerRef.value ? 'osm' : 'grb'

        foundFeatures.push(properties)
      }
      return false // Continue to collect all features
    }, {
      hitTolerance: 3
    })

    if (foundFeatures.length > 0 && !isTooltipSticky.value) {
      // Clear previous hover state
      if (currentHoveredFeatureObj && currentHoveredFeatureObj !== firstFeature) {
        if (currentHoveredFeatureObj instanceof Feature) {
          currentHoveredFeatureObj.set('hovered', false)
        }
      }

      // Set new hover state on first feature
      if (currentHoveredFeatureObj !== firstFeature) {
        // Only set hover state for regular features, not vector tile features
        try {
          if (firstFeature instanceof Feature && firstFeature.set) {
            firstFeature.set('hovered', true)
          }
        } catch (error) {
          // Vector tile features don't support set method
        }
        currentHoveredFeatureObj = firstFeature

        hoveredFeatures.value = foundFeatures

        // Change cursor to pointer
        map.value.getTargetElement().style.cursor = 'pointer'
      }
    } else if (!isTooltipSticky.value) {
      // Clear hover state
      if (currentHoveredFeatureObj) {
        try {
          if (currentHoveredFeatureObj instanceof Feature && currentHoveredFeatureObj.set) {
            currentHoveredFeatureObj.set('hovered', false)
          }
        } catch (error) {
          // Vector tile features don't support set method
        }
        currentHoveredFeatureObj = null
        hoveredFeatures.value = []

        // Reset cursor
        map.value.getTargetElement().style.cursor = ''
      }
      }
    }, 16) // ~60fps, reduces canvas reads significantly
  })
}

onMounted(() => {
  nextTick(() => {
    setTimeout(() => {
      setupMap()
      setupHoverInteraction()

      // Check initial zoom level for layer visibility
      if (map.value) {
        const initialZoom = Math.round(map.value.getView().getZoom() || 13)
        handleZoomBasedLayerVisibility(initialZoom)
      }

      // Automatically load OSM and GRB layers
      setTimeout(() => {
        handleLoadOSM()
        handleLoadGRB()
      }, 100)
    }, 50)
  })
})

onUnmounted(() => {
  destroy()
})
</script>