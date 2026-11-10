<template>
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
      <div v-if="differenceState === 'loading'" class="flex items-center gap-2 text-[11px] text-muted-foreground py-1">
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
          Everything in view already matches OSM. Pan to a new area, lower the match strictness, or switch match mode.
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
                {{ josmConnected === true ? 'JOSM ready' : josmConnected === false ? 'JOSM offline' : 'JOSM unknown' }}
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
      :source-supports-tags="supportsSourceTags(activeSource === null ? 'grb' : activeSource)"
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

    <JosmHelpDialog v-model:open="josmHelpOpen" :connected="josmConnected" :testing="josmTesting" @test="checkJosm" />
  </div>
</template>

<script setup lang="ts">
import { CircleAlert, ExternalLink, Loader2, RotateCcw, X } from 'lucide-vue-next'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { resolveMatchMode, supportsSourceTags } from '~/utils/matchMode'
import { CANDIDATES_CONTRACT } from '~/utils/candidates'
import JosmHelpDialog from '~/components/JosmHelpDialog.vue'
import type { MapState } from '~/components/InteractiveMap.vue'
import MatchModeControl from '~/components/MatchModeControl.vue'
import { hslVar } from '~/lib/utils'
import { useLayersPanel } from '~/composables/useLayerPanel'
import { useMatchMode } from '~/composables/useMatchMode'
import { useToast } from '~/composables/useToast'

// Props and state for the difference panel component
const { mapState } = defineProps<{ mapState: MapState }>()

// Destructure map state for easier access within the component
const { candidateBuildingCount, currentZoom, map, overlayLayers, activeSource } = mapState

// Composables for match mode and JOSM export
const { matchMode, geometryThreshold, useOverpass } = useMatchMode()
const toast = useToast()
const { exportLayerToJosm, testJosmConnection } = useJosmExport()
const { collapsed: layersPanelCollapsed } = useLayersPanel()

// Matching stats state
const matchingStats = ref<{
  totalGrb: number
  totalOsm: number
  matched: number
  unmatched: number
} | null>(null)

// Candidate buildings state
// Store original features for reset
const originalCandidateFeatures = ref<any[]>([])
// Loading state for Get Difference button
const isCalculatingDifference = ref(false)

// Workflow prerequisites (issue: turn gates into visible guidance).
// At least one source layer (GRB, KNW, PICC, or UrbIS) must be loaded and visible.
const canCalculateDifference = ref(false)

// Difference workflow lifecycle state, surfaced as a persistent results panel
// Instead of disappearing toasts.
type DifferenceState = 'idle' | 'loading' | 'success' | 'empty' | 'error'
const differenceState = ref<DifferenceState>('idle')
const differenceError = ref('')

// Soft cap on rendered/exported candidates (mass-import safety + browser performance).
const CANDIDATE_RENDER_CAP = 2000
const candidateTotalInView = ref(0)
const candidateCapped = ref(false)

// Optional geometry simplification applied at export time (reuses the export's mapshaper path).
const simplifyOnExport = ref(false)
const simplifyPercent = ref(85)

const hasSourceLayer = computed(() =>
  Boolean(
    (overlayLayers.value.grbBuildings.ids.length > 0 && overlayLayers.value.grbBuildings.visible === true) ||
    (overlayLayers.value.knwStructures.ids.length > 0 && overlayLayers.value.knwStructures.visible === true) ||
    (overlayLayers.value.piccBuildings.ids.length > 0 && overlayLayers.value.piccBuildings.visible === true) ||
    (overlayLayers.value.urbisBuildings.ids.length > 0 && overlayLayers.value.urbisBuildings.visible === true)
  )
)

const hasOsmLayer = computed(() =>
  Boolean(overlayLayers.value.osmBuildings.ids.length > 0 && overlayLayers.value.osmBuildings.visible === true)
)

// JOSM remote-control connection status (null = not checked yet)
const josmConnected = ref<boolean | null>(null)
const josmTesting = ref(false)
const josmHelpOpen = ref(false)

const checkJosm = async (): Promise<void> => {
  josmTesting.value = true
  try {
    josmConnected.value = await testJosmConnection()
  } catch {
    josmConnected.value = false
  } finally {
    josmTesting.value = false
  }
}

const revealLayersPanel = (): void => {
  layersPanelCollapsed.value = false
}

const zoomToWorkingLevel = (): void => {
  if (!map.value) return

  map.value.zoomTo(17 - 1)
}

const dismissResults = (): void => {
  differenceState.value = 'idle'
  matchingStats.value = null
}

const coveragePct = computed((): number => {
  const stat = matchingStats.value
  if (!stat || !stat.totalGrb) return 0
  return Math.round((stat.matched / stat.totalGrb) * 100)
})

// Source/combined modes are GRB-only; other sources are matched by geometry (see resolveMatchMode).
const effectiveMatchMode = computed(
  (): string => resolveMatchMode(matchMode.value, activeSource.value === null ? 'grb' : activeSource.value).mode
)

// Short, human label for what produced the current results (which mode, freshness).
const matchSummary = computed((): string => {
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

const exportToJOSM = async (): Promise<void> => {
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

// Computed property to check if JOSM export button should be enabled
const canExportToJOSM = computed(
  () =>
    // Check if there are candidate buildings
    candidateBuildingCount.value > 0
)

// Calculate difference between source (GRB/PICC) and OSM buildings and display them
const refreshLiveOsmLayer = async (bounds: (number | undefined)[]): Promise<void> => {
  if (!map.value) return

  const geojson: any = await $fetch('/api/buildings/osm-live', { body: { bounds }, method: 'POST' })

  if (typeof map.value.getSource('osmlive') !== 'undefined') {
    map.value.removeLayer('osmlive-fill')
    map.value.removeLayer('osmlive-line')
    map.value.removeSource('osmlive')
  }

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

  overlayLayers.value.osmLive.ids = ['osmlive-fill', 'osmlive-line']
  overlayLayers.value.osmBuildings.visible = false
  overlayLayers.value.osmLive.visible = true
}

const clearLiveOsmLayer = (): void => {
  if (overlayLayers.value.osmLive.ids.length > 0 && typeof map.value !== 'undefined' && map.value !== null) {
    map.value.removeLayer('osmlive-fill')
    map.value.removeLayer('osmlive-line')
    map.value.removeSource('osmlive')

    overlayLayers.value.osmLive.visible = false
    overlayLayers.value.osmBuildings.visible = true
    overlayLayers.value.osmLive.ids = []
  }
}

// Prefer the API's message (e.g. Overpass rate limit) over the generic fetch error text.
const apiErrorMessage = (error: any): string =>
  error?.data?.statusMessage || error?.statusMessage || (error instanceof Error ? error.message : String(error))

const calculateDifference = async (): Promise<void> => {
  if (!map.value) return

  // Determine which data source is active (GRB, PICC, or UrbIS)
  const grbActive = overlayLayers.value.grbBuildings.visible === true && overlayLayers.value.grbBuildings.ids.length > 0
  const knwActive =
    overlayLayers.value.knwStructures.visible === true && overlayLayers.value.knwStructures.ids.length > 0
  const piccActive =
    overlayLayers.value.piccBuildings.visible === true && overlayLayers.value.piccBuildings.ids.length > 0
  const urbisActive =
    overlayLayers.value.urbisBuildings.visible === true && overlayLayers.value.urbisBuildings.ids.length > 0
  const dataSource = urbisActive ? 'urbis' : piccActive ? 'picc' : knwActive ? 'knw' : 'grb'

  // Check if OSM layer and at least one source layer are loaded
  if (overlayLayers.value.osmBuildings.ids.length === 0 || (!grbActive && !knwActive && !piccActive && !urbisActive)) {
    toast.warning('Layers required', 'Please enable OSM Buildings and a source layer (GRB, KNW, PICC, or UrbIS) first.')
    return
  }

  // Check zoom level
  if (currentZoom.value < 17) {
    toast.warning('Zoom in required', `Please zoom in to at least level 17. Current zoom: ${currentZoom.value}`)
    return
  }

  // Check if OSM layer is visible
  if (!overlayLayers.value.osmBuildings.visible === true) {
    toast.warning('Layer required', 'Please enable the OSM Buildings layer first.')
    return
  }

  // Set loading state
  isCalculatingDifference.value = true
  differenceState.value = 'loading'
  differenceError.value = ''

  try {
    const bounds = map.value.getBounds()
    const extent: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth()
    ]

    if (typeof map.value.getLayer('bounding-box-line') !== 'undefined') {
      map.value.removeLayer('bounding-box-line')
      map.value.removeSource('bounding-box')
    }

    map.value.addSource('bounding-box', {
      data: {
        features: [
          {
            geometry: {
              coordinates: [
                [
                  [extent[0], extent[1]],
                  [extent[2], extent[1]],
                  [extent[2], extent[3]],
                  [extent[0], extent[3]],
                  [extent[0], extent[1]]
                ]
              ],
              type: 'Polygon'
            },
            properties: {},
            type: 'Feature'
          }
        ],
        type: 'FeatureCollection'
      },
      type: 'geojson'
    })
    map.value.addLayer({
      id: 'bounding-box-line',
      paint: {
        'line-color': '#ff0000',
        'line-width': 3
      },
      source: 'bounding-box',
      type: 'line'
    })

    // Live mode: refresh the OSM layer from Overpass too (non-fatal; the difference call reports errors)
    if (useOverpass.value)
      await refreshLiveOsmLayer(extent).catch((error) => console.warn('Live OSM layer failed:', error))
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
      if (overlayLayers.value.candidateBuildings.ids.length > 0) {
        for (const id of overlayLayers.value.candidateBuildings.ids) map.value.removeLayer(id)

        overlayLayers.value.candidateBuildings.ids = []
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
    for (const feature of candidateGeoJSON.features) {
      feature.properties = feature.properties || {}
      feature.properties._layer_type = sourceKind
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

    console.log('Candidate features loaded:', candidateGeoJSON.features.length)

    // Remove existing candidate buildings layer if present
    if (typeof map.value.getSource('candidates-buildings') !== 'undefined') {
      map.value.removeLayer('candidates-buildings-fill')
      map.value.removeLayer('candidates-buildings-line')
      map.value.removeSource('candidates-buildings')
    }

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

    overlayLayers.value.candidateBuildings.ids = ['candidates-buildings-fill', 'candidates-buildings-line']
    overlayLayers.value.candidateBuildings.visible = true

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

// Keyboard shortcuts: G = Get Difference, J = open in JOSM. Ignored while typing.
const handleKeydown = (e: KeyboardEvent): void => {
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

// Watch for match mode changes and refetch candidate buildings if they're already loaded
watch(matchMode, (): void => {
  if (overlayLayers.value.candidateBuildings.ids.length > 0)
    // Refetch candidate buildings with the new match mode
    calculateDifference()
})

// Watch for geometry threshold changes and refetch candidate buildings if necessary
watch(geometryThreshold, (): void => {
  if (
    (matchMode.value === 'geometry' || matchMode.value === 'both') &&
    overlayLayers.value.candidateBuildings.ids.length > 0
  )
    calculateDifference()
})

// Watch for useOverpass changes and refetch candidate buildings if necessary
watch(useOverpass, (live): void => {
  if (!live) clearLiveOsmLayer()
  if (overlayLayers.value.candidateBuildings.ids.length > 0) calculateDifference()
})

// Handle actions when the component is mounted
onMounted(() => {
  // One quiet probe so the JOSM status chip reflects reality on load.
  checkJosm()

  window.addEventListener('keydown', handleKeydown)
})

// Handle actions when the component is unmounted
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
