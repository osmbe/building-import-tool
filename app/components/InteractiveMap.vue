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
      <LayersPanel :map-state="mapState"></LayersPanel>

      <!-- Bottom-right: Match Mode + Stats stacked -->
      <DifferencePanel :map-state="mapState"></DifferencePanel>
    </div>
  </div>
</template>

<script lang="ts">
import type { ComputedRef, Ref } from 'vue'
import type { OverlayLayers as LayerOverlayLayers, SourceKind as LayerSourceKind } from '~/components/LayersPanel.vue'
import type { useMapLibre as UseMapLibreComposable } from '~/composables/useMapLibre'

export interface MapState {
  baselayers: ReturnType<typeof UseMapLibreComposable>['baselayers']
  candidateBuildingCount: Ref<number>
  candidateBuildingsLayerIdRef: Ref<string[]>
  currentBaseLayer: ReturnType<typeof UseMapLibreComposable>['currentBaseLayer']
  currentCenter: Ref<[number, number]>
  currentZoom: Ref<number>
  grbBuildingsLayerIdRef: Ref<string[]>
  knwStructuresLayerIdRef: Ref<string[]>
  layersCollapsed: Ref<boolean>
  liveOsmLayerIdRef: Ref<string[]>
  map: ReturnType<typeof UseMapLibreComposable>['map']
  osmBuildingsLayerIdRef: Ref<string[]>
  overlayLayers: Ref<LayerOverlayLayers>
  piccBuildingsLayerIdRef: Ref<string[]>
  selectedSource: ComputedRef<LayerSourceKind | 'none'>
  setLayersVisibility: ReturnType<typeof UseMapLibreComposable>['setLayersVisibility']
  switchBaseLayer: ReturnType<typeof UseMapLibreComposable>['switchBaseLayer']
  urbisBuildingsLayerIdRef: Ref<string[]>
}
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import type { SourceKind } from '~/components/LayersPanel.vue'
import GettingStartedCard from '~/components/GettingStartedCard.vue'
import type { SearchResult } from '~/composables/useSearch'
import { useMapLibre } from '~/composables/useMapLibre'
import type { MapOptions } from 'maplibre-gl'
import LayersPanel from '~/components/LayersPanel.vue'
import DifferencePanel from '~/components/DifferencePanel.vue'

const { selectedLocation } = defineProps<{ selectedLocation: SearchResult | null }>()

const mapRef = ref<HTMLElement>()

// Use the map layers composable
const {
  map,
  currentBaseLayer,
  initializeMap,
  loadOSMBuildingsLayer,
  loadGrbBuildingsLayer,
  loadKnwStructuresLayer,
  loadPiccBuildingsLayer,
  loadUrbisBuildingsLayer,
  setLayersVisibility,
  switchBaseLayer,
  baselayers,
  destroy
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

const selectedSource = computed<SourceKind | 'none'>(() => {
  if (overlayLayers.value.grbBuildings) return 'grb'
  if (overlayLayers.value.knwStructures) return 'knw'
  if (overlayLayers.value.piccBuildings) return 'picc'
  if (overlayLayers.value.urbisBuildings) return 'urbis'
  return 'none'
})

const mapState = {
  baselayers,
  candidateBuildingCount,
  candidateBuildingsLayerIdRef,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  grbBuildingsLayerIdRef,
  knwStructuresLayerIdRef,
  layersCollapsed,
  liveOsmLayerIdRef,
  map,
  osmBuildingsLayerIdRef,
  overlayLayers,
  piccBuildingsLayerIdRef,
  selectedSource,
  setLayersVisibility,
  switchBaseLayer,
  urbisBuildingsLayerIdRef
}

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

    const zoom = Math.floor(mapInstance.getZoom() ?? 0) + 1
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
    const shouldShow = currentZoom.value >= 16 && overlayLayers.value.osmBuildings
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

onMounted(() => {
  // NextTick().then(() => {
  //   SetTimeout(() => {
  setupMap()

  if (map.value) {
    // Check initial zoom level for layer visibility
    handleZoomBasedLayerVisibility(currentZoom.value)

    // Automatically load OSM and GRB layers
    const initializeOverlays = () => {
      handleLoadOSM()
      handleLoadGRB()
      handleLoadKNW()
      handleLoadPICC()
      handleLoadUrbis()
    }

    if (map.value.isStyleLoaded()) initializeOverlays()
    else map.value.once('style.load', initializeOverlays)
  }
  //   }, 50)
  // })
})

onUnmounted(() => {
  destroy()
})
</script>
