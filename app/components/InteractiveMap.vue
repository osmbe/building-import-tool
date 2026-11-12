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

      <!-- Bottom-right: Match Mode + Stats (stacked) Panels -->
      <DifferencePanel :map-state="mapState"></DifferencePanel>

      <!-- Top-right: Info Panel -->
      <InfoPanel :map-state="mapState"></InfoPanel>
    </div>
  </div>
</template>

<script lang="ts">
import type { OverlayLayers, SourceKind } from '~/components/LayersPanel.vue'
import type { Ref } from 'vue'
import type { useMapLibre as UseMapLibreComposable } from '~/composables/useMapLibre'
import InfoPanel from '~/components/InfoPanel.vue'

export interface MapState {
  activeSource: Ref<SourceKind | null>
  baselayers: ReturnType<typeof UseMapLibreComposable>['baselayers']
  candidateBuildingCount: Ref<number>
  clickedFeatures: ReturnType<typeof UseMapLibreComposable>['clickedFeatures']
  currentBaseLayer: ReturnType<typeof UseMapLibreComposable>['currentBaseLayer']
  currentCenter: ReturnType<typeof UseMapLibreComposable>['currentCenter']
  currentZoom: ReturnType<typeof UseMapLibreComposable>['currentZoom']
  map: ReturnType<typeof UseMapLibreComposable>['map']
  overlayLayers: Ref<OverlayLayers>
}
</script>

<script setup lang="ts">
import type { Map, MapOptions } from 'maplibre-gl'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import DifferencePanel from '~/components/DifferencePanel.vue'
import GettingStartedCard from '~/components/GettingStartedCard.vue'
import LayersPanel from '~/components/LayersPanel.vue'
import type { SearchResult } from '~/composables/useSearch'
import { useMapLibre } from '~/composables/useMapLibre'

// Use the map layers composable
const {
  map,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  clickedFeatures,
  initializeMap,
  loadOSMBuildingsLayer,
  loadGrbBuildingsLayer,
  // loadKnwStructuresLayer,
  loadPiccBuildingsLayer,
  loadUrbisBuildingsLayer,
  switchBaseLayer,
  baselayers,
  destroy
} = useMapLibre()

// Props passed to the component
const { selectedLocation } = defineProps<{ selectedLocation: SearchResult | null }>()

// Map container reference
const mapRef = ref<HTMLElement>()

// Candidate building count reference
const candidateBuildingCount = ref(0)

// Active source reference
const activeSource = ref<SourceKind | null>(null)

// Overlay layers state reference
const overlayLayers: Ref<OverlayLayers> = ref({
  candidateBuildings: { ids: [], visible: false },
  grbBuildings: { ids: [], visible: false },
  knwStructures: { ids: [], visible: false },
  osmBuildings: { ids: [], visible: true },
  osmLive: { ids: [], visible: false },
  piccBuildings: { ids: [], visible: false },
  urbisBuildings: { ids: [], visible: false }
})

// Initialize map state object
const mapState = {
  activeSource,
  baselayers,
  candidateBuildingCount,
  clickedFeatures,
  currentBaseLayer,
  currentCenter,
  currentZoom,
  map,
  overlayLayers
}

// Watch for changes in the current base layer and update the map accordingly
watch(
  () => currentBaseLayer.value,
  (baselayer) => {
    switchBaseLayer(baselayer)
  }
)

// Watch for changes in the overlay layers and update the map accordingly
for (const layer of Object.values(overlayLayers.value))
  watch(
    () => [layer.visible, layer.ids] as const,
    ([visible, ids]) => {
      if (!map.value) return

      for (const layerId of ids)
        if (map.value.getLayer(layerId))
          map.value.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  )

// Watch for changes in the selected location (via geocoder) and fly the map to the new location
watch(
  () => selectedLocation,
  (loc) => {
    if (!loc || !map.value) return
    map.value.flyTo({
      center: loc.coordinates,
      zoom: 17
    })
  }
)

// Setup the map on component mount
const setupMap = (): void => {
  if (!mapRef.value) return

  // Initialize map with composable
  initializeMap(mapRef.value, {
    center: [4.3517, 50.8503],
    zoom: 7
  } as MapOptions)
}

// Initialize overlay layer on the map
const initOverlayLayer = (fn: (map: Map) => string[], visible: boolean): string[] => {
  if (typeof map.value === 'undefined' || map.value === null) {
    console.error('Map not initialized')
    return []
  }

  try {
    const ids = fn(map.value)

    for (const layerId of ids) map.value.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')

    return ids
  } catch (error) {
    console.error('Failed to load overlay layer:', error)
  }

  return []
}

// Setup map and overlay layers when the component is mounted
onMounted(() => {
  setupMap()

  if (map.value) {
    const initializeOverlays = (): void => {
      overlayLayers.value.osmBuildings.ids = initOverlayLayer(
        loadOSMBuildingsLayer,
        overlayLayers.value.osmBuildings.visible
      )
      overlayLayers.value.grbBuildings.ids = initOverlayLayer(
        loadGrbBuildingsLayer,
        overlayLayers.value.grbBuildings.visible
      )
      // overlayLayers.value.knwStructures.ids = initOverlayLayer(
      //   loadKnwStructuresLayer,
      //   overlayLayers.value.knwStructures.visible
      // )
      overlayLayers.value.piccBuildings.ids = initOverlayLayer(
        loadPiccBuildingsLayer,
        overlayLayers.value.piccBuildings.visible
      )
      overlayLayers.value.urbisBuildings.ids = initOverlayLayer(
        loadUrbisBuildingsLayer,
        overlayLayers.value.urbisBuildings.visible
      )
    }

    if (map.value.isStyleLoaded()) initializeOverlays()
    else map.value.once('style.load', initializeOverlays)
  }
})

// Cleanup map and overlay layers when the component is unmounted
onUnmounted(() => {
  destroy()
})
</script>
