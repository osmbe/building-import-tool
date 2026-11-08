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
  currentBaseLayer: ReturnType<typeof UseMapLibreComposable>['currentBaseLayer']
  currentCenter: Ref<[number, number]>
  currentZoom: Ref<number>
  layersCollapsed: Ref<boolean>
  map: ReturnType<typeof UseMapLibreComposable>['map']
  overlayLayers: Ref<LayerOverlayLayers>
  selectedSource: ComputedRef<LayerSourceKind | 'none'>
  setLayersVisibility: ReturnType<typeof UseMapLibreComposable>['setLayersVisibility']
  switchBaseLayer: ReturnType<typeof UseMapLibreComposable>['switchBaseLayer']
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
  currentCenter,
  currentZoom,
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

const candidateBuildingCount = ref(0)

const layersCollapsed = ref(false)

const overlayLayers = ref({
  candidateBuildings: { ids: [] as string[], visible: false },
  grbBuildings: { ids: [] as string[], visible: false },
  knwStructures: { ids: [] as string[], visible: false },
  osmBuildings: { ids: [] as string[], visible: false },
  osmLive: { ids: [] as string[], visible: false },
  piccBuildings: { ids: [] as string[], visible: false },
  urbisBuildings: { ids: [] as string[], visible: false }
})

const selectedSource = computed<SourceKind | 'none'>(() => {
  if (overlayLayers.value.grbBuildings.visible === true) return 'grb'
  if (overlayLayers.value.knwStructures.visible === true) return 'knw'
  if (overlayLayers.value.piccBuildings.visible === true) return 'picc'
  if (overlayLayers.value.urbisBuildings.visible === true) return 'urbis'
  return 'none'
})

const mapState = {
  baselayers,
  candidateBuildingCount,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  layersCollapsed,
  map,
  overlayLayers,
  selectedSource,
  setLayersVisibility,
  switchBaseLayer
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
  initializeMap(mapRef.value, {
    center: [4.3517, 50.8503],
    zoom: 7
  } as MapOptions)
}

// Handle Load OSM Buildings using Vector Tiles from Martin
const handleLoadOSM = () => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing OSM buildings layer if present
    if (overlayLayers.value.osmBuildings.ids.length > 0)
      for (const layerId of overlayLayers.value.osmBuildings.ids) map.value.removeLayer(layerId)

    // Add layer to map
    overlayLayers.value.osmBuildings.ids = loadOSMBuildingsLayer(map.value)

    // Update UI state
    overlayLayers.value.osmBuildings.visible = true

    // Set initial visibility based on current zoom level
    setLayersVisibility(overlayLayers.value.osmBuildings.ids, true)
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
    if (overlayLayers.value.grbBuildings.ids.length > 0)
      for (const layerId of overlayLayers.value.grbBuildings.ids) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    overlayLayers.value.grbBuildings.ids = loadGrbBuildingsLayer(map.value)

    setLayersVisibility(overlayLayers.value.grbBuildings.ids, false)
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
    if (overlayLayers.value.knwStructures.ids.length > 0)
      for (const layerId of overlayLayers.value.knwStructures.ids) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    overlayLayers.value.knwStructures.ids = loadKnwStructuresLayer(map.value)

    setLayersVisibility(overlayLayers.value.knwStructures.ids, false)
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
    if (overlayLayers.value.piccBuildings.ids.length > 0)
      for (const layerId of overlayLayers.value.piccBuildings.ids) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    overlayLayers.value.piccBuildings.ids = loadPiccBuildingsLayer(map.value)

    setLayersVisibility(overlayLayers.value.piccBuildings.ids, false)
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
    if (overlayLayers.value.urbisBuildings.ids.length > 0)
      for (const layerId of overlayLayers.value.urbisBuildings.ids) map.value.removeLayer(layerId)

    // Add layer to map (hidden by default — user toggles it on)
    overlayLayers.value.urbisBuildings.ids = loadUrbisBuildingsLayer(map.value)

    setLayersVisibility(overlayLayers.value.urbisBuildings.ids, false)
  } catch (error) {
    console.error('Failed to load UrbIS buildings:', error)
  }
}

onMounted(() => {
  // NextTick().then(() => {
  //   SetTimeout(() => {
  setupMap()

  if (map.value) {
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
