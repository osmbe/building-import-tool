<template>
  <div class="h-full w-full">
    <div class="h-full w-full relative">
      <!-- OpenLayers Map Container -->
      <div id="map" ref="mapRef" class="absolute inset-0" :class="currentBaseLayer === 'blank' ? 'bg-white' : ''" style="width: 100%; height: 100%; min-height: 400px;"></div>

      <!-- Match Mode Control -->
      <MatchModeControl />

      <!-- Controls -->
      <div class="absolute right-4 top-4 flex flex-col gap-2 w-48">
        <Card class="p-2 bg-slate-800 text-gray-100 shadow-xl border-slate-600">
          <div class="flex items-center gap-1 mb-2">
            <Button variant="outline" size="icon" class="h-6 w-6" @click="zoomIn">
              <ZoomIn class="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" class="h-6 w-6" @click="zoomOut">
              <ZoomOut class="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" class="h-6 w-6" @click="resetView">
              <RotateCcw class="h-3 w-3" />
            </Button>
          </div>

          <!-- Base Layer Selection -->
          <div class="border-t border-slate-600 pt-2 mb-2">
            <div class="text-xs font-medium text-gray-300 uppercase tracking-wide mb-1">Base</div>
            <div class="space-y-1">
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start text-xs px-2 py-1 h-7"
                :class="currentBaseLayer === 'blank' ? 'bg-blue-600 hover:bg-blue-700' : ''"
                @click="switchBaseLayer('blank')"
              >
                Blank
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start text-xs px-2 py-1 h-7"
                :class="currentBaseLayer === 'osm' ? 'bg-blue-600 hover:bg-blue-700' : ''"
                @click="switchBaseLayer('osm')"
              >
                OSM
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start text-xs px-2 py-1 h-7"
                :class="currentBaseLayer === 'flanders' ? 'bg-blue-600 hover:bg-blue-700' : ''"
                @click="switchBaseLayer('flanders')"
              >
                Flanders
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start text-xs px-2 py-1 h-7"
                :class="currentBaseLayer === 'wallonia' ? 'bg-blue-600 hover:bg-blue-700' : ''"
                @click="switchBaseLayer('wallonia')"
              >
                Wallonia
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="w-full justify-start text-xs px-2 py-1 h-7"
                :class="currentBaseLayer === 'brussels' ? 'bg-blue-600 hover:bg-blue-700' : ''"
                @click="switchBaseLayer('brussels')"
              >
                Brussels
              </Button>
            </div>
          </div>

          <div class="border-t border-slate-600 pt-2 space-y-1">
            <Button variant="outline" size="sm" class="w-full justify-start text-xs px-2 py-1 h-7" :disabled="!canCalculateDifference || isCalculatingDifference" @click="calculateDifference">
              <Loader2 v-if="isCalculatingDifference" class="h-3 w-3 mr-1 animate-spin" />
              <GitCompareArrows v-else class="h-3 w-3 mr-1" />
              {{ isCalculatingDifference ? 'Calculating...' : 'Get Difference' }}
            </Button>
            <Button variant="outline" size="sm" class="w-full justify-start text-xs px-2 py-1 h-7" :disabled="!canExportToJOSM" @click="exportToJOSM">
              <ExternalLink class="h-3 w-3 mr-1" />
              JOSM
            </Button>
          </div>
        </Card>
      </div>

      <!-- Bottom left panel showing active layers -->
      <div class="absolute bottom-4 left-4 flex flex-col gap-2">
        <Card class="p-3 bg-slate-800/95 backdrop-blur text-gray-100 shadow-xl border-slate-600 min-w-[240px]">
          <h3 class="text-sm font-semibold mb-3 text-gray-200">Layers</h3>
          <div class="space-y-3">
            <!-- Overlay Layers with toggles -->
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-3 h-3 bg-orange-400 rounded flex-shrink-0"></div>
                <span class="text-xs text-gray-200">Candidate Buildings</span>
              </div>
              <div class="flex items-center gap-2 flex-shrink-0">
                <Badge variant="secondary" class="text-xs px-1.5 py-0.5 bg-slate-700 text-gray-300 border-slate-600">{{ candidateBuildingCount }}</Badge>
                <Switch v-model:checked="overlayLayers.candidateBuildings" @update:checked="toggleCandidateBuildings" />
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-3 h-3 bg-orange-600 rounded flex-shrink-0"></div>
                <span class="text-xs text-gray-200">OSM Buildings</span>
              </div>
              <div class="flex-shrink-0">
                <Switch v-model:checked="overlayLayers.osmBuildings" @update:checked="toggleOsmBuildings" />
              </div>
            </div>

            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2 flex-1">
                <div class="w-3 h-3 bg-green-500 rounded flex-shrink-0"></div>
                <span class="text-xs text-gray-200">GRB Buildings</span>
              </div>
              <div class="flex-shrink-0">
                <Switch v-model:checked="overlayLayers.grbBuildings" @update:checked="toggleGrbBuildings" />
              </div>
            </div>
          </div>

          <div class="border-t border-slate-600/60 pt-2.5 mt-3 space-y-1">
            <div class="text-[11px] text-gray-400">
              <span class="text-gray-500">Zoom:</span> <span class="font-mono">{{ currentZoom }}</span>
            </div>
            <div class="text-[11px] text-gray-400">
              <span class="text-gray-500">Center:</span> <span class="font-mono">{{ currentCenter[1].toFixed(4) }}, {{ currentCenter[0].toFixed(4) }}</span>
            </div>
          </div>
        </Card>
      </div>

      <!-- Right panel showing Matching Stats and Simplification Control -->
      <div class="absolute bottom-4 right-4 flex flex-col gap-2 w-48">
        <!-- Matching Stats Panel -->
        <Card v-if="matchingStats" class="p-3 bg-slate-800 text-gray-100 shadow-xl border-slate-600">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium">Matching Stats</h3>
            <Button variant="ghost" size="icon" class="h-5 w-5 p-0" @click="matchingStats = null">
              <X class="h-3 w-3" />
            </Button>
          </div>
          <div class="space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Total GRB</span>
              <Badge variant="secondary" class="text-xs">{{ matchingStats.totalGrb }}</Badge>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-gray-400">Total OSM</span>
              <Badge variant="secondary" class="text-xs">{{ matchingStats.totalOsm }}</Badge>
            </div>
            <div class="border-t border-slate-600 pt-2 mt-2">
              <div class="flex items-center justify-between mb-1">
                <span class="text-green-400">✓ Matched</span>
                <Badge class="text-xs bg-green-600">{{ matchingStats.matched }}</Badge>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-blue-400">→ Unmatched</span>
                <Badge class="text-xs bg-blue-600">{{ matchingStats.unmatched }}</Badge>
              </div>
            </div>
            <div class="text-xs text-gray-400 pt-2 border-t border-slate-600">
              {{ Math.round((matchingStats.matched / matchingStats.totalGrb) * 100) }}% coverage
            </div>
          </div>
        </Card>

      </div>

      <ObjectInfoPanel :building="activeBuilding" :is-open="panelOpen" @close="panelOpen=false" @operation-complete="onOperationComplete" />

      <!-- Building Feature Info Panel -->
      <div
        v-if="hoveredFeatures.length > 0 || isTooltipSticky"
        :class="isTooltipSticky ? 'pointer-events-auto' : 'pointer-events-none'"
        class="absolute top-4 left-4 z-50 w-80"
      >
        <Card class="p-4 bg-slate-900/95 backdrop-blur text-gray-100 shadow-2xl border-slate-700">
          <div class="space-y-4">
            <!-- Display all features (GRB first, then OSM) -->
            <template v-if="(isTooltipSticky ? clickedFeatures : hoveredFeatures).length > 0">
              <div v-for="(feature, index) in sortFeatures(isTooltipSticky ? clickedFeatures : hoveredFeatures)" :key="index"
                   :class="{ 'pt-4 border-t border-slate-600': index > 0 }">
                <!-- GRB Building Display -->
                <template v-if="feature._layer_type === 'grb'">
                  <!-- Header -->
                  <div class="flex items-start justify-between mb-4">
                    <div>
                      <div class="flex items-center gap-2">
                        <Building2 class="h-5 w-5 text-green-400" />
                        <h2 class="text-lg font-semibold">{{ formatGRBBuildingType(feature.type_label) }}</h2>
                      </div>
                      <div class="text-xs text-gray-400 mt-1">
                        GRB ID: {{ feature.gebouw_id || feature.id }}
                      </div>
                    </div>
                    <Button v-if="isTooltipSticky" variant="ghost" size="icon" @click="closeTooltip">
                      <X class="h-4 w-4" />
                    </Button>
                  </div>

                  <!-- Addresses Section -->
                  <div v-if="feature.addresses" class="space-y-2 mb-4">
                    <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <MapPin class="h-4 w-4" />
                      <span>Addresses</span>
                    </div>
                    <div class="pl-6 space-y-1">
                      <div
                        v-for="(address, idx) in parsePostgresArray(feature.addresses)"
                        :key="idx"
                        class="text-sm text-gray-200 py-1"
                      >
                        {{ address }}
                      </div>
                    </div>
                  </div>

                  <!-- Location Section -->
                  <div v-if="!feature.addresses && (feature.street_names || feature.postcodes || feature.municipalities)" class="space-y-2 mb-4">
                    <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <MapPinned class="h-4 w-4" />
                      <span>Location</span>
                    </div>
                    <div class="pl-6 space-y-1.5 text-sm">
                      <div v-if="feature.street_names" class="text-gray-200">
                        <span class="text-gray-400">Street: </span>{{ parsePostgresArray(feature.street_names).join(', ') }}
                      </div>
                      <div v-if="feature.postcodes" class="text-gray-200">
                        <span class="text-gray-400">Postcode: </span>{{ parsePostgresArray(feature.postcodes).join(', ') }}
                      </div>
                      <div v-if="feature.municipalities" class="text-gray-200">
                        <span class="text-gray-400">Municipality: </span>{{ parsePostgresArray(feature.municipalities).join(', ') }}
                      </div>
                    </div>
                  </div>

                  <!-- Building Details Section -->
                  <div class="space-y-2">
                    <div class="flex items-center gap-2 text-sm font-medium text-gray-300">
                      <Ruler class="h-4 w-4" />
                      <span>Building Details</span>
                    </div>
                    <div class="pl-6 space-y-1.5 text-sm">
                      <div v-if="feature.total_area_m2" class="text-gray-200">
                        <span class="text-gray-400">Total Area: </span>{{ formatArea(feature.total_area_m2) }}
                      </div>
                      <div v-if="feature.polygon_count" class="text-gray-200">
                        <span class="text-gray-400">Polygon Parts: </span>{{ feature.polygon_count }}
                      </div>
                    </div>
                  </div>
                </template>

                <!-- OSM Building Display -->
                <template v-else>
                  <!-- Header -->
                  <div class="flex items-start justify-between mb-4">
                    <div>
                      <div class="flex items-center gap-2">
                        <Building2 class="h-5 w-5 text-orange-400" />
                        <h2 class="text-lg font-semibold">
                          {{ (feature.building && feature.building !== 'yes' ? feature.building : null) || 'Building' }}
                        </h2>
                      </div>
                      <div class="text-xs text-gray-400 mt-1">
                        OSM ID: {{ feature.osm_id }}
                      </div>
                    </div>
                    <Button v-if="isTooltipSticky" variant="ghost" size="icon" @click="closeTooltip">
                      <X class="h-4 w-4" />
                    </Button>
                  </div>

                  <!-- OSM Properties -->
                  <div v-if="getDisplayableProperties(feature).length > 0" class="space-y-2">
                    <div class="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                      <MapPin class="h-4 w-4" />
                      <span>Properties</span>
                    </div>
                    <div class="pl-6 space-y-1.5 text-sm">
                      <div v-for="[key, value] in getDisplayableProperties(feature)" :key="key" class="text-gray-200">
                        <span class="text-gray-400">{{ formatPropertyKey(key) }}: </span>{{ formatPropertyValue(value) }}
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </template>

            <!-- Action hint for non-sticky panel -->
            <div v-if="!isTooltipSticky" class="text-xs text-gray-500 pt-2 border-t border-slate-600 text-center">
              Click to pin this panel
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { fromLonLat, toLonLat } from 'ol/proj'
import Feature from 'ol/Feature'
import VectorTileLayer from 'ol/layer/VectorTile'
import VectorTileSource from 'ol/source/VectorTile'
import { MVT, GeoJSON } from 'ol/format'
import { Style, Fill, Stroke } from 'ol/style'
import Card from '~/components/ui/card.vue'
import Button from '~/components/ui/button.vue'
import Badge from '~/components/ui/badge.vue'
import Switch from '~/components/ui/switch.vue'
import { Layers, ZoomIn, ZoomOut, RotateCcw, X, ExternalLink, MapPin, GitCompareArrows, Loader2, Building2, MapPinned, Ruler } from 'lucide-vue-next'
import ObjectInfoPanel from '~/components/ObjectInfoPanel.vue'
import MatchModeControl from '~/components/MatchModeControl.vue'
import { mockBuildingData, type BuildingData } from '~/composables/useBuildingData'
import type { SearchResult } from '~/composables/useSearch'
import { useJosmExport } from '~/composables/useJosmExport'
import { extractFeaturesFromLayer } from '~/utils/openlayers'
import { useMapLayers } from '~/composables/useMapLayers'
import { useAuth } from '~/composables/useAuth'
import { useMatchMode } from '~/composables/useMatchMode'

const props = defineProps<{ selectedLocation: SearchResult | null }>()

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
const osmLoadedCount = ref(0)

// GRB Buildings layer state
const grbBuildingsLayerRef = ref<any>(null)
const grbLoadedCount = ref(0)
const isLoadingGRB = ref(false)

// Candidate Buildings layer state
const candidateBuildingsLayerRef = ref<any>(null)
const candidateBuildingCount = ref(0)

// Building feature info panel state
const hoveredFeatures = ref<any[]>([])
const clickedFeatures = ref<any[]>([])
const isTooltipSticky = ref(false)

// Overlay layers (can be combined)
const overlayLayers = ref({
  candidateBuildings: true,
  osmBuildings: true,
  grbBuildings: false,
  conflicts: true,
  addresses: false,
  boundaries: false
})

const currentZoom = ref(13)
const currentCenter = ref<[number, number]>([4.3047, 50.9087])
const panelOpen = ref(false)
const activeBuilding = ref<BuildingData | null>(null)
const showLayersPanel = ref(false)

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

// Computed values for building counts
const qaIssueCount = computed(() =>
  mockBuildingData.filter(b => b.type === 'conflict').length
)

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
const canExportToJOSM = computed(() => {
  
  // Check if there are candidate buildings
  return candidateBuildingCount.value > 0
})

watch(() => props.selectedLocation, (loc) => {
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
    center: [4.3047, 50.9087],
    zoom: 13
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
    center: fromLonLat([4.3047, 50.9087]),
    zoom: 13,
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
const handleLoadOSM = async () => {
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
    osmLoadedCount.value = 1 // Vector tiles don't have a direct count

    // Set initial visibility based on current zoom level
    const currentZoomLevel = Math.round(map.value.getView().getZoom() || 13)
    const shouldShow = currentZoomLevel >= 16 && overlayLayers.value.osmBuildings
    osmTileLayer.setVisible(shouldShow)
  } catch (error) {
    console.error('Failed to load OSM buildings:', error)
  }
}

// Handle Load GRB Buildings using Vector Tiles
const handleLoadGRB = async () => {
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
    grbLoadedCount.value = 1 // Vector tiles don't have a direct count, so show as loaded

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
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]

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

  const grbCoords = grbGeom.coordinates[0] // exterior ring

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

    const osmCoords = osmGeom.coordinates[0] // exterior ring

    // Check if polygons overlap
    if (polygonsOverlap(grbCoords, osmCoords)) {
      console.log(`Match found: GRB polygon overlaps with OSM polygon`)
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
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

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
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of coords) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  return [minX, minY, maxX, maxY]
}

// Helper function to check if two bounding boxes overlap or are very close
const boundingBoxesIntersect = (bbox1: [number, number, number, number], bbox2: [number, number, number, number], tolerance: number = 5): boolean => {
  // tolerance in map units (meters in EPSG:31370)
  return !(bbox1[2] + tolerance < bbox2[0] || bbox1[0] - tolerance > bbox2[2] || bbox1[3] + tolerance < bbox2[1] || bbox1[1] - tolerance > bbox2[3])
}

// Helper function to merge polygon fragments properly
// Combines all coordinates from fragments and reconstructs the polygon
const mergePolygonFragments = (polygons: Array<[number, number][]>): [number, number][] => {
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
  let leftmost = points[0]
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

      const cross = (a: [number, number], b: [number, number], c: [number, number]) => {
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
      }

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
        console.log(`Merging fragments by ID: ${featureId}`)
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
      console.log(`Merging ${fragmentsToMerge.length} building fragments (ID: ${featureId || 'none'})`)
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

  console.log(`Building merge complete: ${features.length} features → ${merged.length} features`)
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
    alert('Please zoom in to at least level 16 to calculate differences.\n\nCurrent zoom: ' + roundedZoom)
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

    console.log('Map extent (EPSG:3857):', bounds)

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
    const candidateStyleFunction = () => {
      return new Style({
        fill: new Fill({
          color: 'rgba(251, 146, 60, 0.4)' // Orange with 40% opacity
        }),
        stroke: new Stroke({
          color: 'rgba(251, 146, 60, 1.0)', // Orange with 100% opacity
          width: 2
        })
      })
    }

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
    alert('Error calculating difference:\n\n' + (error instanceof Error ? error.message : String(error)))
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
    alert('Error exporting to JOSM:\n\n' + error.message + '\n\nPlease check:\n1. JOSM is running with remote control enabled\n2. Port 8111 is not blocked by firewall\n3. Network connectivity')
  }
}

const onOperationComplete = (res: any) => {
  // Handle operation completion
  console.log('Operation completed:', res)
}

// Close tooltip function
const closeTooltip = () => {
  isTooltipSticky.value = false
  clickedFeatures.value = []
  hoveredFeatures.value = []
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

    for (let i = 0; i < inner.length; i++) {
      const char = inner[i]
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

  return [str]
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
    'serre': 'Conservatory'
  }

  return translations[type.toLowerCase()] || type
}

// Helper function to sort features - GRB first, then OSM
const sortFeatures = (features: any[]): any[] => {
  return [...features].sort((a, b) => {
    // GRB features (_layer_type === 'grb') come first
    if (a._layer_type === 'grb' && b._layer_type !== 'grb') return -1
    if (a._layer_type !== 'grb' && b._layer_type === 'grb') return 1
    return 0
  })
}

// Helper function to parse PostgreSQL hstore tags format
const parseHstoreTags = (tagsString: string): Record<string, string> => {
  const tags: Record<string, string> = {}

  // Parse hstore format: "key"=>"value", "key2"=>"value2"
  const regex = /"([^"]+)"=>"([^"]*)"/g
  let match

  while ((match = regex.exec(tagsString)) !== null) {
    const key = match[1]
    const value = match[2]
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
    .filter(([key, value]) => {
      // Exclude internal properties and empty values
      return !excludedProps.includes(key) &&
             value !== null &&
             value !== undefined &&
             value !== ''
    })
    .forEach(([key, value]) => {
      // Apply GRB mapping if it's a GRB feature
      if (isGrb && grbPropertyMapping.hasOwnProperty(key)) {
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
      .filter(([key, value]) => {
        return value !== null &&
               value !== undefined &&
               value !== ''
      })
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
          // Check if it includes time (has T or space followed by time)
          const hasTime = value.includes('T') || /\d{2}:\d{2}/.test(value)

          if (hasTime) {
            // Format as datetime
            return new Intl.DateTimeFormat('nl-BE', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }).format(date)
          } else {
            // Format as date only
            return new Intl.DateTimeFormat('nl-BE', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            }).format(date)
          }
        }
      } catch (e) {
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
  let hoverTimeout: any = null
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