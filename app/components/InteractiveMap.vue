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

const initOverlayLayer = (overlayLayer: { ids: string[]; visible: boolean }, fn: Function, visible: boolean) => {
  if (!map.value) {
    console.error('Map not initialized')
    return
  }

  try {
    // Remove existing  layer if present
    if (overlayLayer.ids.length > 0) for (const layerId of overlayLayer.ids) map.value.removeLayer(layerId)

    // Add layer to map
    overlayLayer.ids = fn(map.value)
    overlayLayer.visible = visible

    // Set initial visibility based on current zoom level
    setLayersVisibility(overlayLayer.ids, visible)
  } catch (error) {
    console.error('Failed to load OSM buildings:', error)
  }
}

onMounted(() => {
  // NextTick().then(() => {
  //   SetTimeout(() => {
  setupMap()

  if (map.value) {
    const initializeOverlays = () => {
      initOverlayLayer(overlayLayers.value.osmBuildings, loadOSMBuildingsLayer, true)
      initOverlayLayer(overlayLayers.value.grbBuildings, loadGrbBuildingsLayer, false)
      initOverlayLayer(overlayLayers.value.knwStructures, loadKnwStructuresLayer, false)
      initOverlayLayer(overlayLayers.value.piccBuildings, loadPiccBuildingsLayer, false)
      initOverlayLayer(overlayLayers.value.urbisBuildings, loadUrbisBuildingsLayer, false)
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
