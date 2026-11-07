<template>
  <div class="h-full w-full">
    <div class="h-full w-full relative">
      <!-- OpenLayers Map Container -->
      <div
        id="map"
        ref="mapRef"
        class="absolute inset-0"
        :class="currentBaseLayer === 'blank' ? 'bg-[#f5f0e8]' : ''"
        style="width: 100%; height: 100%; min-height: 400px"
      ></div>

      <!-- First-run guidance -->
      <GettingStartedCard :has-candidates="candidateBuildingCount > 0" />

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
                    v-model:checked="overlayLayers.candidateBuildings"
                    @update:checked="toggleCandidateBuildings"
                  />
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
                  <span
                    class="layer-dot"
                    :style="{ color: `hsl(var(${opt.varName}))`, background: 'currentColor' }"
                  ></span>
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
                <span class="font-mono text-foreground/55"
                  >{{ currentCenter[1].toFixed(4) }}, {{ currentCenter[0].toFixed(4) }}</span
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom-right: Match Mode + Stats stacked -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-2 w-56">
        <!-- Results panel (loading / empty / error / success) -->
        <div v-if="differenceState !== 'idle'" class="glass-panel rounded-lg p-3">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <h3 class="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">Results</h3>
              <span
                v-if="useOverpass"
                class="inline-flex items-center gap-1 px-1 py-px rounded text-[8px] font-semibold uppercase tracking-wide text-emerald-400 bg-emerald-400/10 border border-emerald-400/20"
              >
                <span class="h-1 w-1 rounded-full bg-emerald-400"></span>
                Live
              </span>
            </div>
            <button
              class="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Dismiss results"
              @click="dismissResults"
            >
              <X class="h-3 w-3" />
            </button>
          </div>

          <!-- Loading -->
          <div
            v-if="differenceState === 'loading'"
            class="flex items-center gap-2 text-[11px] text-muted-foreground py-1"
          >
            <Loader2 class="h-3 w-3 animate-spin shrink-0" />
            <span>Searching this view…</span>
          </div>

          <!-- Error -->
          <div v-else-if="differenceState === 'error'" class="space-y-2">
            <div class="flex items-start gap-2 text-[11px] text-red-300/90">
              <CircleAlert class="h-3.5 w-3.5 shrink-0 mt-px text-red-400" />
              <span>Could not calculate the difference.</span>
            </div>
            <p v-if="differenceError" class="text-[10px] text-muted-foreground break-words leading-relaxed">
              {{ differenceError }}
            </p>
            <button class="result-retry" @click="calculateDifference">
              <RotateCcw class="h-2.5 w-2.5" />
              Retry
            </button>
          </div>

          <!-- Empty -->
          <div v-else-if="differenceState === 'empty'" class="space-y-1.5">
            <p class="text-[11px] text-foreground/85">No missing buildings here.</p>
            <p class="text-[10px] text-muted-foreground leading-relaxed">
              Everything in view already matches OSM. Pan to a new area, lower the match strictness, or switch match
              mode.
            </p>
            <p class="text-[9px] text-muted-foreground/70 pt-0.5">{{ matchSummary }}</p>
          </div>

          <!-- Success -->
          <div v-else-if="differenceState === 'success' && matchingStats" class="space-y-1.5 text-[11px]">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Source total</span>
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
                <span class="text-sky-400/90">Candidates</span>
                <span class="font-mono font-medium text-sky-400">{{ matchingStats.unmatched }}</span>
              </div>
            </div>
            <div class="pt-2 border-t border-white/[0.05]">
              <div class="flex items-center justify-between mb-1.5">
                <span class="text-muted-foreground">Coverage</span>
                <span class="font-mono text-primary font-medium">{{ coveragePct }}%</span>
              </div>
              <div class="h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary/75 rounded-full transition-all duration-700"
                  :style="{ width: coveragePct + '%' }"
                ></div>
              </div>
            </div>
            <!-- Cap notice when there are more candidates than we render/export at once -->
            <div v-if="candidateCapped" class="flex items-start gap-1.5 pt-2 text-[10px] text-amber-300/90">
              <CircleAlert class="h-3 w-3 shrink-0 mt-px text-amber-400" />
              <span
                >Showing the first {{ candidateBuildingCount.toLocaleString() }} of
                {{ candidateTotalInView.toLocaleString() }}. Zoom in to review the rest.</span
              >
            </div>

            <!-- Optional simplification before export -->
            <div class="pt-2 mt-1 border-t border-white/[0.05]">
              <label class="flex items-center justify-between gap-2 cursor-pointer select-none">
                <span class="text-[10px] text-foreground/80">Simplify geometry on export</span>
                <input type="checkbox" class="accent-primary h-3 w-3" v-model="simplifyOnExport" />
              </label>
              <div v-if="simplifyOnExport" class="mt-1.5 flex items-center gap-2">
                <input
                  type="range"
                  min="50"
                  max="98"
                  step="1"
                  class="flex-1 accent-primary"
                  v-model.number="simplifyPercent"
                />
                <span class="font-mono text-[10px] text-foreground/60 w-8 text-right">{{ simplifyPercent }}%</span>
              </div>
              <p v-if="simplifyOnExport" class="text-[9px] text-muted-foreground/70 mt-1 leading-relaxed">
                Keeps {{ simplifyPercent }}% of detail. Reduces node count on dense GRB outlines.
              </p>
            </div>

            <p class="text-[9px] text-muted-foreground/70 pt-1.5 leading-relaxed">
              {{ matchSummary }}. Open in JOSM to review before upload.
            </p>

            <div class="p-2 space-y-1">
              <button
                class="action-btn w-full"
                :disabled="!canExportToJOSM"
                title="Open in JOSM (J)"
                aria-label="Open candidates in JOSM"
                @click="exportToJOSM"
              >
                <ExternalLink class="h-3 w-3 shrink-0" />
                <span>Open in JOSM</span>
              </button>

              <!-- JOSM connection status -->
              <div class="flex items-center justify-between px-0.5 pt-1">
                <div class="flex items-center gap-1.5">
                  <span
                    class="h-1.5 w-1.5 rounded-full shrink-0"
                    :class="
                      josmConnected === true
                        ? 'bg-emerald-400'
                        : josmConnected === false
                          ? 'bg-red-400'
                          : 'bg-muted-foreground/40'
                    "
                  ></span>
                  <span class="text-[9px] text-muted-foreground">
                    {{
                      josmConnected === true ? 'JOSM ready' : josmConnected === false ? 'JOSM offline' : 'JOSM unknown'
                    }}
                  </span>
                </div>
                <button
                  class="text-[9px] text-primary/80 hover:text-primary transition-colors"
                  @click="josmHelpOpen = true"
                >
                  Set up
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Match Mode Control -->
        <MatchModeControl
          :source-supports-tags="supportsSourceTags(selectedSource === 'none' ? 'grb' : selectedSource)"
          :map-ready="Boolean(map)"
          :source-layer-enabled="hasSourceLayer"
          :osm-layer-enabled="hasOsmLayer"
          :zoom="currentZoom"
          :calculating="isCalculatingDifference"
          @readiness-change="canCalculateDifference = $event"
          @calculate-difference="calculateDifference"
          @reveal-layers="revealLayersPanel"
          @zoom-to-working-level="zoomToWorkingLevel"
        />
      </div>

      <!-- JOSM setup help -->
      <JosmHelpDialog
        v-model:open="josmHelpOpen"
        :connected="josmConnected"
        :testing="josmTesting"
        :instructions="josmInstructions"
        @test="checkJosm"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Building2,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  Landmark,
  Loader2,
  RotateCcw,
  X
} from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import MatchModeControl from '~/components/MatchModeControl.vue'
import GettingStartedCard from '~/components/GettingStartedCard.vue'
import JosmHelpDialog from '~/components/JosmHelpDialog.vue'
import type { SearchResult } from '~/composables/useSearch'
import Switch from '~/components/ui/switch.vue'
import { CANDIDATES_CONTRACT, candidateDetail, candidateDisplayId } from '~/utils/candidates'
import { useJosmExport } from '~/composables/useJosmExport'
import { useMapLibre } from '~/composables/useMapLibre'
import { useMatchMode } from '~/composables/useMatchMode'
import { resolveMatchMode, supportsSourceTags } from '~/utils/matchMode'
import { useToast } from '~/composables/useToast'
import type { MapOptions, StyleLayer } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'

const { selectedLocation } = defineProps<{ selectedLocation: SearchResult | null }>()

const mapRef = ref<HTMLElement>()
const { exportLayerToJosm, testJosmConnection, getJosmInstructions } = useJosmExport()
const josmInstructions = getJosmInstructions()
const { matchMode, geometryThreshold, useOverpass } = useMatchMode()
const toast = useToast()

// Use the map layers composable
const {
  map,
  currentBaseLayer,
  initializeMap,
  switchBaseLayer,
  loadOSMBuildingsLayer,
  loadGrbBuildingsLayer,
  loadKnwStructuresLayer,
  loadPiccBuildingsLayer,
  loadUrbisBuildingsLayer,
  getZoomLevel,
  setLayersVisibility,
  destroy,
  baselayers
} = useMapLibre()

// OSM Buildings layer state
const osmBuildingsLayerIdRef = ref<string[]>([])

// Live OSM layer (Overpass, issue #9): replaces the tile layer while "Live OSM data" is on
const liveOsmLayerIdRef = ref<string[]>([])

// GRB Buildings layer state
const grbBuildingsLayerIdRef = ref<string[]>([])

// GRB KNW structures layer state
const knwStructuresLayerIdRef = ref<string[]>([])

// PICC Buildings layer state
const piccBuildingsLayerIdRef = ref<string[]>([])

// UrbIS Buildings layer state
const urbisBuildingsLayerIdRef = ref<string[]>([])

// Candidate Buildings layer state
const candidateBuildingsLayerIdRef = ref<string[]>([])
const candidateBuildingCount = ref(0)

const layersCollapsed = ref(false)

// Overlay layers (can be combined)
const overlayLayers = ref({
  addresses: false,
  boundaries: false,
  candidateBuildings: false,
  conflicts: true,
  grbBuildings: false,
  knwStructures: false,
  osmBuildings: true,
  piccBuildings: false,
  urbisBuildings: false
})

const currentZoom = ref(7)
const currentCenter = ref<[number, number]>([4.3517, 50.8503])

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

// Workflow prerequisites (issue: turn gates into visible guidance).
// At least one source layer (GRB, KNW, PICC, or UrbIS) must be loaded and visible.
const hasSourceLayer = computed(() =>
  Boolean(
    (grbBuildingsLayerIdRef.value.length > 0 && overlayLayers.value.grbBuildings) ||
    (knwStructuresLayerIdRef.value.length > 0 && overlayLayers.value.knwStructures) ||
    (piccBuildingsLayerIdRef.value.length > 0 && overlayLayers.value.piccBuildings) ||
    (urbisBuildingsLayerIdRef.value.length > 0 && overlayLayers.value.urbisBuildings)
  )
)
const hasOsmLayer = computed(() => Boolean(osmBuildingsLayerIdRef.value.length > 0 && overlayLayers.value.osmBuildings))
const canCalculateDifference = ref(false)

// Difference workflow lifecycle state, surfaced as a persistent results panel
// Instead of disappearing toasts.
type DifferenceState = 'idle' | 'loading' | 'success' | 'empty' | 'error'
const differenceState = ref<DifferenceState>('idle')
const differenceError = ref('')

// Optional geometry simplification applied at export time (reuses the export's mapshaper path).
const simplifyOnExport = ref(false)
const simplifyPercent = ref(85)

// Soft cap on rendered/exported candidates (mass-import safety + browser performance).
const CANDIDATE_RENDER_CAP = 2000
const candidateTotalInView = ref(0)
const candidateCapped = ref(false)

// JOSM remote-control connection status (null = not checked yet)
const josmConnected = ref<boolean | null>(null)
const josmTesting = ref(false)
const josmHelpOpen = ref(false)

const checkJosm = async () => {
  josmTesting.value = true
  try {
    josmConnected.value = await testJosmConnection()
  } catch {
    josmConnected.value = false
  } finally {
    josmTesting.value = false
  }
}

// Open the layers panel and scroll a hint into view (used by the checklist).
const revealLayersPanel = () => {
  layersCollapsed.value = false
}

const zoomToWorkingLevel = () => {
  if (!map.value) return

  map.value.zoomTo(15)
}

const dismissResults = () => {
  differenceState.value = 'idle'
  matchingStats.value = null
}

// Keyboard shortcuts: G = Get Difference, J = open in JOSM. Ignored while typing.
const handleKeydown = (e: KeyboardEvent) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

  const key = e.key.toLowerCase()
  if (key === 'g' && canCalculateDifference.value && !isCalculatingDifference.value) {
    e.preventDefault()
    calculateDifference()
  } else if (key === 'j' && canExportToJOSM.value) {
    e.preventDefault()
    exportToJOSM()
  }
}

const coveragePct = computed(() => {
  const s = matchingStats.value
  if (!s || !s.totalGrb) return 0
  return Math.round((s.matched / s.totalGrb) * 100)
})

// Source/combined modes are GRB-only; other sources are matched by geometry (see resolveMatchMode).
const effectiveMatchMode = computed(
  () => resolveMatchMode(matchMode.value, selectedSource.value === 'none' ? 'grb' : selectedSource.value).mode
)

// Short, human label for what produced the current results (which mode, freshness).
const matchSummary = computed(() => {
  const pct = Math.round(geometryThreshold.value * 100)
  const mode =
    effectiveMatchMode.value === 'source'
      ? 'Source tag'
      : effectiveMatchMode.value === 'both'
        ? `Geometry ${pct}% + source tag`
        : `Geometry ${pct}%`
  const freshness = useOverpass.value ? 'live Overpass' : 'OSM mirror'
  return `${mode} · ${freshness}`
})

// Computed property to check if JOSM export button should be enabled
const canExportToJOSM = computed(
  () =>
    // Check if there are candidate buildings
    candidateBuildingCount.value > 0
)

// Watch for changes in the selected location (via geocoder) and fly the map to the new location
watch(
  () => selectedLocation,
  (loc) => {
    if (!loc || !map.value) return
    map.value.flyTo({
      center: loc.coordinates,
      zoom: 16
    })
  }
)

// Watch for match mode changes and refetch candidate buildings if they're already loaded
watch(matchMode, () => {
  if (candidateBuildingsLayerIdRef.value.length > 0)
    // Refetch candidate buildings with the new match mode
    calculateDifference()
})

watch(geometryThreshold, () => {
  if ((matchMode.value === 'geometry' || matchMode.value === 'both') && candidateBuildingsLayerIdRef.value.length > 0)
    calculateDifference()
})

watch(useOverpass, (live) => {
  if (!live) clearLiveOsmLayer()
  if (candidateBuildingsLayerIdRef.value.length > 0) calculateDifference()
})

const setupMap = () => {
  if (!mapRef.value) return

  // Initialize map with composable
  const mapInstance = initializeMap(mapRef.value, {
    center: [4.3517, 50.8503],
    zoom: 7
  } as MapOptions)

  // Update reactive values when map moves
  mapInstance.on('moveend', () => {
    if (!map.value) return

    const zoom = getZoomLevel()
    currentZoom.value = zoom

    const { lng, lat } = mapInstance.getCenter()
    currentCenter.value = [lng, lat]

    // Handle visibility of building layers based on zoom
    handleZoomBasedLayerVisibility(zoom)
  })
}

// Handle visibility of building layers based on zoom level
const handleZoomBasedLayerVisibility = (zoom: number) => {
  if (!map.value) return

  const shouldShowBuildings = zoom >= 16

  // Only show/hide existing layers, don't auto-load
  if (osmBuildingsLayerIdRef.value.length > 0)
    setLayersVisibility(
      osmBuildingsLayerIdRef.value,
      shouldShowBuildings && overlayLayers.value.osmBuildings && liveOsmLayerIdRef.value.length === 0
    )

  if (liveOsmLayerIdRef.value.length > 0)
    setLayersVisibility(liveOsmLayerIdRef.value, shouldShowBuildings && overlayLayers.value.osmBuildings)

  if (grbBuildingsLayerIdRef.value.length > 0)
    setLayersVisibility(grbBuildingsLayerIdRef.value, shouldShowBuildings && overlayLayers.value.grbBuildings)

  if (knwStructuresLayerIdRef.value.length > 0)
    setLayersVisibility(knwStructuresLayerIdRef.value, shouldShowBuildings && overlayLayers.value.knwStructures)

  if (piccBuildingsLayerIdRef.value.length > 0)
    setLayersVisibility(piccBuildingsLayerIdRef.value, shouldShowBuildings && overlayLayers.value.piccBuildings)

  if (urbisBuildingsLayerIdRef.value.length > 0)
    setLayersVisibility(urbisBuildingsLayerIdRef.value, shouldShowBuildings && overlayLayers.value.urbisBuildings)
}

// Handle Load OSM Buildings using Vector Tiles from Martin
const handleLoadOSM = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing OSM buildings layer if present
    if (osmBuildingsLayerIdRef.value.length > 0)
      for (const layerId of osmBuildingsLayerIdRef.value) map.value.removeLayer(layerId)

    // Add layer to map
    osmBuildingsLayerIdRef.value = loadOSMBuildingsLayer(map.value)

    // Update UI state
    overlayLayers.value.osmBuildings = true

    // Set initial visibility based on current zoom level
    const shouldShow = getZoomLevel() >= 16 && overlayLayers.value.osmBuildings
    setLayersVisibility(osmBuildingsLayerIdRef.value, shouldShow)
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
    // Remove existing GRB buildings layer if present
    if (grbBuildingsLayerIdRef.value.length > 0)
      for (const layerId of grbBuildingsLayerIdRef.value) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    grbBuildingsLayerIdRef.value = loadGrbBuildingsLayer(map.value)

    setLayersVisibility(grbBuildingsLayerIdRef.value, false)
  } catch (error) {
    console.error('Failed to load GRB buildings:', error)
  }
}

// Handle Load KNW Structures using Vector Tiles
const handleLoadKNW = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing KNW structures layer if present
    if (knwStructuresLayerIdRef.value.length > 0)
      for (const layerId of knwStructuresLayerIdRef.value) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    knwStructuresLayerIdRef.value = loadKnwStructuresLayer(map.value)

    setLayersVisibility(knwStructuresLayerIdRef.value, false)
  } catch (error) {
    console.error('Failed to load KNW structures:', error)
  }
}

// Handle Load PICC Buildings using Vector Tiles from Martin
const handleLoadPICC = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing PICC buildings layer if present
    if (piccBuildingsLayerIdRef.value.length > 0)
      for (const layerId of piccBuildingsLayerIdRef.value) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    piccBuildingsLayerIdRef.value = loadPiccBuildingsLayer(map.value)

    setLayersVisibility(piccBuildingsLayerIdRef.value, false)
  } catch (error) {
    console.error('Failed to load PICC buildings:', error)
  }
}

// Handle Load UrbIS Buildings using Vector Tiles from Martin
const handleLoadUrbis = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing UrbIS buildings layer if present
    if (urbisBuildingsLayerIdRef.value.length > 0)
      for (const layerId of urbisBuildingsLayerIdRef.value) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    urbisBuildingsLayerIdRef.value = loadUrbisBuildingsLayer(map.value)

    setLayersVisibility(urbisBuildingsLayerIdRef.value, false)
  } catch (error) {
    console.error('Failed to load UrbIS buildings:', error)
  }
}

// Layer toggle functions (kept for layer panel compatibility)

const toggleCandidateBuildings = (visible: boolean) => {
  overlayLayers.value.candidateBuildings = visible

  // Toggle visibility of candidate buildings layer
  setLayersVisibility(candidateBuildingsLayerIdRef.value, visible)
}

const toggleOsmBuildings = (visible: boolean) => {
  overlayLayers.value.osmBuildings = visible

  // Toggle visibility of OSM buildings layer
  setLayersVisibility(osmBuildingsLayerIdRef.value, visible && liveOsmLayerIdRef.value.length === 0)

  if (liveOsmLayerIdRef.value.length > 0) setLayersVisibility(liveOsmLayerIdRef.value, visible)
}

const toggleGrbBuildings = (visible: boolean) => {
  overlayLayers.value.grbBuildings = visible

  setLayersVisibility(grbBuildingsLayerIdRef.value, visible)

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

  setLayersVisibility(knwStructuresLayerIdRef.value, visible)

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

  setLayersVisibility(piccBuildingsLayerIdRef.value, visible)

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

  setLayersVisibility(urbisBuildingsLayerIdRef.value, visible)

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

// Source dataset is single-select (GRB / KNW / PICC / UrbIS are mutually exclusive).
// Reflect the active one and route clicks through the existing toggle handlers, which
// Already disable the others.
type SourceKind = 'grb' | 'knw' | 'picc' | 'urbis'
const selectedSource = computed<SourceKind | 'none'>(() => {
  if (overlayLayers.value.grbBuildings) return 'grb'
  if (overlayLayers.value.knwStructures) return 'knw'
  if (overlayLayers.value.piccBuildings) return 'picc'
  if (overlayLayers.value.urbisBuildings) return 'urbis'
  return 'none'
})

const sourceOptions: { key: SourceKind; label: string; varName: string }[] = [
  { key: 'grb', label: 'GRB', varName: '--layer-grb' },
  { key: 'knw', label: 'KNW', varName: '--layer-knw' },
  { key: 'picc', label: 'PICC', varName: '--layer-picc' },
  { key: 'urbis', label: 'UrbIS', varName: '--layer-urbis' }
]

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

const selectSource = (src: SourceKind) => {
  // Clicking the active dataset turns it off; otherwise switch to it.
  const turnOn = selectedSource.value !== src
  if (src === 'grb') toggleGrbBuildings(turnOn)
  else if (src === 'knw') toggleKnwStructures(turnOn)
  else if (src === 'picc') togglePiccBuildings(turnOn)
  else toggleUrbisBuildings(turnOn)
}

// Helper function to calculate polygon centroid
const getPolygonCentroid = (coords: [number, number][]): [number, number] => {
  if (!coords || coords.length === 0) return [0, 0]
  let x = 0,
    y = 0
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
    const pi = polygon[i]
    const pj = polygon[j]
    if (!pi || !pj) continue
    const [xi, yi] = pi
    const [xj, yj] = pj

    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }

  return inside
}

// Helper function to check if two polygons overlap significantly
const polygonsOverlap = (grbCoords: [number, number][], osmCoords: [number, number][]): boolean => {
  // Check if any GRB vertex is inside OSM polygon
  for (const coord of grbCoords) if (pointInPolygon(coord, osmCoords)) return true

  // Check if any OSM vertex is inside GRB polygon
  for (const coord of osmCoords) if (pointInPolygon(coord, grbCoords)) return true

  return false
}

// Helper function to check if a GRB feature has a matching OSM feature
const hasMatchingOSMFeature = (grbFeature: any, osmFeatures: any[]): boolean => {
  const grbGeom = grbFeature.geometry
  if (!grbGeom || !grbGeom.coordinates || grbGeom.type !== 'Polygon') return false

  const [grbCoords] = grbGeom.coordinates // Exterior ring

  // Check if any OSM feature overlaps with this GRB feature
  for (const osmFeature of osmFeatures) {
    const osmSource = osmFeature.properties?.source || ''

    // Skip OSM features that already have GRB as source
    if (osmSource.includes('Gbg')) continue

    // Check OSM geometry
    const osmGeom = osmFeature.geometry
    if (!osmGeom || !osmGeom.coordinates || osmGeom.type !== 'Polygon') continue

    const [osmCoords] = osmGeom.coordinates // Exterior ring

    // Check if polygons overlap
    if (polygonsOverlap(grbCoords, osmCoords)) return true
  }

  return false
}

// Helper function to get bounding box of a polygon
const getBoundingBox = (coords: [number, number][]): [number, number, number, number] => {
  if (!coords || coords.length === 0) return [0, 0, 0, 0]
  let maxX = -Infinity,
    maxY = -Infinity,
    minX = Infinity,
    minY = Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

// Helper function to check if two bounding boxes overlap or are very close
const boundingBoxesIntersect = (
  bbox1: [number, number, number, number],
  bbox2: [number, number, number, number],
  tolerance = 5
): boolean =>
  // Tolerance in map units (meters in EPSG:31370)
  !(
    bbox1[2] + tolerance < bbox2[0] ||
    bbox1[0] - tolerance > bbox2[2] ||
    bbox1[3] + tolerance < bbox2[1] ||
    bbox1[1] - tolerance > bbox2[3]
  )

// Helper function to merge polygon fragments properly
// Combines all coordinates from fragments and reconstructs the polygon
const mergePolygonFragments = (polygons: [number, number][][]): [number, number][] => {
  const [firstPolygon] = polygons
  if (!firstPolygon) return []
  if (polygons.length === 1) return firstPolygon

  // For 2+ fragments, combine all unique coordinates and reconstruct
  // The key insight: vector tile fragments overlap at boundaries,
  // So combining all points gives us the complete building outline
  const allCoords: [number, number][] = []

  for (const polygon of polygons) allCoords.push(...polygon)

  // Remove duplicate/very close coordinates (within 0.01 units)
  const uniqueCoords: [number, number][] = []
  for (const coord of allCoords) {
    const isDuplicate = uniqueCoords.some(
      (existing) => Math.abs(existing[0] - coord[0]) < 0.01 && Math.abs(existing[1] - coord[1]) < 0.01
    )
    if (!isDuplicate) uniqueCoords.push(coord)
  }

  if (uniqueCoords.length < 3) return firstPolygon

  // Use Concave Hull (radial sweep) to order points while preserving concavity
  // This is more accurate than angle-from-centroid for concave shapes
  const ordered = concaveHull(uniqueCoords)

  return ordered.length >= 3 ? ordered : firstPolygon
}

// Concave hull algorithm - orders points to form a polygon preserving concavity
const concaveHull = (points: [number, number][]): [number, number][] => {
  if (points.length <= 3) return points

  // Find the leftmost point
  let leftmostIdx = 0
  let leftmostX = Infinity
  for (const [i, [x]] of points.entries())
    if (x < leftmostX) {
      leftmostX = x
      leftmostIdx = i
    }

  // Gift wrapping (Jarvis march) algorithm adapted for concave hulls
  const hull: [number, number][] = []
  let current = leftmostIdx
  let previous = -1

  do {
    const curr = points[current]
    if (!curr) break
    hull.push(curr)
    let next = 0

    for (const [i, candidate] of points.entries()) {
      if (i === current || i === previous) continue

      const cross = (a: [number, number], b: [number, number], c: [number, number]) =>
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

      const nxt = points[next]

      if (next === previous || !nxt) {
        next = i
      } else {
        const crossProduct = cross(curr, nxt, candidate)
        if (crossProduct > 0) next = i
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
  const tolerance = 5 // Meters in EPSG:31370 - tolerance for considering features as fragments of same building

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
      const coordsToMerge = fragmentsToMerge.map((f) => f.coords)
      // Merge all fragments by combining coordinates and reconstructing polygon
      const mergedCoords = mergePolygonFragments(coordsToMerge)
      merged.push({
        geometry: {
          coordinates: [mergedCoords],
          type: 'Polygon'
        },
        properties: feature.properties || {},
        type: 'Feature'
      })
    } else {
      merged.push(feature)
    }
  }

  return merged
}

// Calculate difference between source (GRB/PICC) and OSM buildings and display them
// Issue #9: drop the live OSM layer and show the tile layer (Postgres mirror) again.
const clearLiveOsmLayer = () => {
  if (liveOsmLayerIdRef.value.length > 0 && typeof map.value !== 'undefined' && map.value !== null)
    liveOsmLayerIdRef.value.forEach((id) => map.value?.removeLayer(id))

  liveOsmLayerIdRef.value = []

  if (osmBuildingsLayerIdRef.value.length > 0) {
    const visible = overlayLayers.value.osmBuildings && getZoomLevel() >= 16

    setLayersVisibility(osmBuildingsLayerIdRef.value, visible)
  }
}

// Issue #9: draw the fresh Overpass buildings for the view so the map matches the difference results.
const refreshLiveOsmLayer = async (bounds: (number | undefined)[]) => {
  if (!map.value) return
  const geojson: any = await $fetch('/api/buildings/osm-live', { body: { bounds }, method: 'POST' })

  if (liveOsmLayerIdRef.value.length > 0 && map.value)
    liveOsmLayerIdRef.value.forEach((id) => map.value?.removeLayer(id))

  map.value.addSource('osmlive', {
    data: geojson,
    type: 'geojson'
  })

  map.value.addLayer({
    id: 'osmlive-fill',
    paint: {
      'fill-color': hslVar('--layer-osm', 0.15)
    },
    source: 'osmlive',
    type: 'fill'
  })
  map.value.addLayer(
    {
      id: 'osmlive-line',
      paint: {
        'line-color': hslVar('--layer-osm', 1),
        'line-width': 2
      },
      source: 'osmlive',
      type: 'line'
    },
    'osmlive-fill'
  )

  liveOsmLayerIdRef.value = ['osmlive-fill', 'osmlive-line']

  setLayersVisibility(osmBuildingsLayerIdRef.value, false)
}

// Prefer the API's message (e.g. Overpass rate limit) over the generic fetch error text.
const apiErrorMessage = (error: any): string =>
  error?.data?.statusMessage || error?.statusMessage || (error instanceof Error ? error.message : String(error))

const calculateDifference = async () => {
  if (!map.value) return

  // Determine which data source is active (GRB, PICC, or UrbIS)
  const grbActive = overlayLayers.value.grbBuildings && grbBuildingsLayerIdRef.value.length > 0
  const knwActive = overlayLayers.value.knwStructures && knwStructuresLayerIdRef.value.length > 0
  const piccActive = overlayLayers.value.piccBuildings && piccBuildingsLayerIdRef.value.length > 0
  const urbisActive = overlayLayers.value.urbisBuildings && urbisBuildingsLayerIdRef.value.length > 0
  const dataSource = urbisActive ? 'urbis' : piccActive ? 'picc' : knwActive ? 'knw' : 'grb'

  // Check if OSM layer and at least one source layer are loaded
  if (osmBuildingsLayerIdRef.value.length === 0 || (!grbActive && !knwActive && !piccActive && !urbisActive)) {
    toast.warning('Layers required', 'Please enable OSM Buildings and a source layer (GRB, KNW, PICC, or UrbIS) first.')
    return
  }

  // Check zoom level
  const zoom = getZoomLevel()
  if (zoom < 16) {
    toast.warning('Zoom in required', `Please zoom in to at least level 16. Current zoom: ${zoom}`)
    return
  }

  // Check if OSM layer is visible
  if (!overlayLayers.value.osmBuildings) {
    toast.warning('Layer required', 'Please enable the OSM Buildings layer first.')
    return
  }

  // Set loading state
  isCalculatingDifference.value = true
  differenceState.value = 'loading'
  differenceError.value = ''

  try {
    const bounds = map.value.getBounds()
    const extent: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]

    if (typeof map.value.getLayer('bounding-box-line') !== 'undefined') {
      map.value.removeLayer('bounding-box-line')
      map.value.removeSource('bounding-box')
    }

    map.value.addSource('bounding-box', {
      data: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [extent[0], extent[1]],
                [extent[2], extent[1]],
                [extent[2], extent[3]],
                [extent[0], extent[3]],
                [extent[0], extent[1]]
              ]]
            },
            properties: {}
          }
        ]
      },
      type: 'geojson'
    })
    map.value.addLayer({
      id: 'bounding-box-line',
      type: 'line',
      source: 'bounding-box',
      paint: {
        'line-color': '#ff0000',
        'line-width': 3
      }
    })

    // Live mode: refresh the OSM layer from Overpass too (non-fatal; the difference call reports errors)
    if (useOverpass.value) await refreshLiveOsmLayer(extent).catch((e) => console.warn('Live OSM layer failed:', e))
    else clearLiveOsmLayer()

    // Call backend API to calculate difference
    const response = await $fetch('/api/buildings/difference', {
      body: {
        bounds: extent,
        contract: CANDIDATES_CONTRACT,
        dataSource,
        geometryThreshold: geometryThreshold.value,
        matchMode: resolveMatchMode(matchMode.value, dataSource).mode,
        useOverpass: useOverpass.value
      },
      method: 'POST'
    })

    const candidateGeoJSON = response as any

    if (!candidateGeoJSON || candidateGeoJSON.features.length === 0) {
      // Persistent empty state in the results panel rather than a disappearing toast.
      differenceState.value = 'empty'

      // Remove existing candidate buildings layer if present
      if (candidateBuildingsLayerIdRef.value.length > 0) {
        for (const id of candidateBuildingsLayerIdRef.value) map.value.removeLayer(id)

        candidateBuildingsLayerIdRef.value = []
      }

      matchingStats.value = null
      candidateBuildingCount.value = 0
      candidateCapped.value = false
      candidateTotalInView.value = 0
      originalCandidateFeatures.value = []
      return
    }

    // Soft cap on how many candidates we render and export at once. Mass imports need
    // Review; loading tens of thousands of features also strains the browser. The true
    // Count is still reported in the stats; the note tells the user what is loaded.
    const totalCandidates = candidateGeoJSON.features.length
    candidateTotalInView.value = totalCandidates
    candidateCapped.value = totalCandidates > CANDIDATE_RENDER_CAP
    if (candidateCapped.value) candidateGeoJSON.features = candidateGeoJSON.features.slice(0, CANDIDATE_RENDER_CAP)

    // Stamp the source kind on each candidate so the review tooltip and JOSM export
    // Know what they are looking at (the candidate layer is a single OL layer).
    const sourceKind =
      dataSource === 'knw' ? 'knw' : dataSource === 'picc' ? 'picc' : dataSource === 'urbis' ? 'urbis' : 'grb'
    for (const f of candidateGeoJSON.features) {
      f.properties = f.properties || {}
      f.properties._layer_type = sourceKind
    }

    // Update matching stats (unmatched reflects the true count missing from OSM)
    const stats = (candidateGeoJSON as any).stats || {}
    matchingStats.value = {
      matched: (stats.totalGrb || 0) - totalCandidates,
      totalGrb: stats.totalGrb || totalCandidates,
      totalOsm: stats.totalOsm || 0,
      unmatched: totalCandidates
    }

    // Candidate count reflects what is actually loaded/exportable (post-cap)
    candidateBuildingCount.value = candidateGeoJSON.features.length

    // Store original features for simplification
    originalCandidateFeatures.value = candidateGeoJSON.features

    // Remove existing candidate buildings layer if present
    if (candidateBuildingsLayerIdRef.value.length > 0)
      for (const id of candidateBuildingsLayerIdRef.value) map.value.removeLayer(id)

    console.log('Candidate features loaded:', candidateGeoJSON.features.length)

    // Parse GeoJSON and create source
    map.value.addSource('candidates-buildings', {
      data: candidateGeoJSON,
      type: 'geojson'
    })

    // Create vector layer for candidate buildings
    map.value.addLayer({
      id: 'candidates-buildings-fill',
      paint: {
        'fill-color': hslVar('--layer-candidate', 0.35)
      },
      source: 'candidates-buildings',
      type: 'fill'
    })
    map.value.addLayer(
      {
        id: 'candidates-buildings-line',
        paint: {
          'line-color': hslVar('--layer-candidate', 1),
          'line-width': 2
        },
        source: 'candidates-buildings',
        type: 'line'
      },
      'candidates-buildings-fill'
    )

    // Add layer to map
    candidateBuildingsLayerIdRef.value = ['candidates-buildings-fill', 'candidates-buildings-line']

    // Enable candidate buildings layer
    overlayLayers.value.candidateBuildings = true
    differenceState.value = 'success'
  } catch (error) {
    console.error('Error calculating difference:', error)
    differenceState.value = 'error'
    differenceError.value = apiErrorMessage(error)
  } finally {
    // Reset loading state
    isCalculatingDifference.value = false
  }
}

const exportToJOSM = async () => {
  if (!map.value) return

  // Check if we have candidate buildings data
  if (originalCandidateFeatures.value.length === 0) {
    toast.warning('No candidates', 'Please click "Get Difference" first to calculate candidate buildings.')
    return
  }

  try {
    // Check JOSM connection first
    josmTesting.value = true
    const isConnected = await testJosmConnection()
    josmConnected.value = isConnected
    josmTesting.value = false
    if (!isConnected) {
      // Open the setup dialog instead of cramming instructions into a toast.
      josmHelpOpen.value = true
      return
    }

    // Use ALL features from the original API response (not just visible ones)
    // This ensures we export everything from "Get Difference", not just what's in viewport
    const allFeatures = originalCandidateFeatures.value

    if (allFeatures.length === 0) {
      toast.warning('Nothing to export', 'No buildings available to export.')
      return
    }

    console.log(`Exporting ${allFeatures.length} candidate buildings to JOSM`)

    // Export to JOSM - ALL features from the candidate layer
    const hasKnwCandidates = allFeatures.some((feature: any) => {
      const layerType = String(feature?.properties?._layer_type || '').toLowerCase()
      const entity = String(feature?.properties?.entity || '').toLowerCase()
      return layerType === 'knw' || entity === 'knw'
    })

    const result = await exportLayerToJosm(
      allFeatures,
      hasKnwCandidates ? 'GRB Candidate Structures (KNW)' : 'GRB Candidate Buildings',
      {
        includeMeta: false,
        simplify: simplifyOnExport.value,
        simplifyPercent: simplifyPercent.value,
        uploadToBackend: false
      }
    )

    console.log('✅ Export successful')
    toast.success(
      'Exported to JOSM',
      `${result.featureCount} building${result.featureCount === 1 ? '' : 's'} loaded as a new layer in JOSM.`
    )
  } catch (error: any) {
    console.error('Error exporting candidate buildings to JOSM:', error)
    josmTesting.value = false
    toast.error('JOSM export failed', error.message || 'Could not send data to JOSM.')
  }
}

onMounted(() => {
  loadDataDates()
  nextTick().then(() => {
    setTimeout(() => {
      setupMap()

      // Check initial zoom level for layer visibility
      if (map.value) {
        const initialZoom = Math.round(getZoomLevel() || 13)
        handleZoomBasedLayerVisibility(initialZoom)
      }

      // Automatically load OSM and GRB layers
      setTimeout(() => {
        handleLoadOSM()
        handleLoadGRB()
        handleLoadKNW()
        handleLoadPICC()
        handleLoadUrbis()
      }, 100)
    }, 50)
  })

  // One quiet probe so the JOSM status chip reflects reality on load.
  checkJosm()

  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  destroy()
})
</script>
