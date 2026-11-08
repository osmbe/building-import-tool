import { AttributionControl, Map, type MapOptions, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { baselayers } from './useMapLibre/baselayers'
import { loadOSMBuildingsLayer } from './useMapLibre/layers/osmBuildings'
import { loadGrbBuildingsLayer } from './useMapLibre/layers/grbBuildings'
import { loadKnwStructuresLayer } from './useMapLibre/layers/knwStructures'
import { loadPiccBuildingsLayer } from './useMapLibre/layers/piccBuildings'
import { loadUrbisBuildingsLayer } from './useMapLibre/layers/urbisBuildings'

setWorkerUrl(workerUrl)

export const useMapLibre = () => {
  const map = shallowRef<Map | null>(null)
  const currentBaseLayer = ref<keyof typeof baselayers>('osmbe')

  // Initialize map
  const initializeMap = (target: HTMLElement, options: MapOptions): Map => {
    if (map.value) {
      console.warn('Map already initialized')
      return map.value
    }

    const defaultOptions: MapOptions = {
      attributionControl: false,
      center: [0, 0],
      container: target,
      hash: true,
      zoom: 1,
      zoomSnap: 1
    }

    const mapInstance = new Map({ ...defaultOptions, ...options })

    mapInstance.addControl(new NavigationControl(), 'top-left')
    mapInstance.addControl(new AttributionControl({ compact: true }), 'top-right')

    Object.keys(baselayers).forEach((key) => {
      if (currentBaseLayer.value === key) mapInstance.setStyle(baselayers[key]?.style ?? null)
    })

    map.value = mapInstance

    return mapInstance
  }

  // Switch the base layer of the map
  const switchBaseLayer = (key: keyof typeof baselayers) => {
    map.value?.setStyle(baselayers[key]?.style ?? null, {
      // Merge overlay sources + layers into the incoming base style
      transformStyle: (previousStyle, nextStyle) => {
        nextStyle.sources = { ...nextStyle.sources }
        nextStyle.layers = [...nextStyle.layers]

        if (typeof previousStyle !== 'undefined') {
          const overlaySources = [
            'osm-buildings',
            'grb-buildings',
            'knw-structures',
            'picc-buildings',
            'urbis-buildings',
            'osmlive',
            'candidates-buildings'
          ]

          for (const source of overlaySources) {
            const previousSource = previousStyle.sources[source]
            if (typeof previousSource !== 'undefined' && !(source in nextStyle.sources)) {
              nextStyle.sources[source] = previousSource
              nextStyle.layers.push(
                ...previousStyle.layers.filter((layer) => 'source' in layer && layer.source === source)
              )
            }
          }
        }

        return nextStyle
      }
    })

    currentBaseLayer.value = key
  }

  // Get current zoom level
  const getZoomLevel = () => Math.floor(map.value?.getZoom() ?? 0) + 1

  // Set Layer visibility
  const setLayersVisibility = (layersId: string[], visible: boolean) => {
    if (!map.value || layersId.length === 0) return

    for (const layerId of layersId) map.value.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
  }

  // Cleanup
  const destroy = () => {
    if (map.value === null) return

    map.value.remove()
    map.value = null
  }

  return {
    // State
    map: map as Ref<Map | null>,
    currentBaseLayer,

    // Methods
    initializeMap,
    switchBaseLayer,
    getZoomLevel,
    setLayersVisibility,
    destroy,

    // Layers methods
    loadOSMBuildingsLayer,
    loadGrbBuildingsLayer,
    loadKnwStructuresLayer,
    loadPiccBuildingsLayer,
    loadUrbisBuildingsLayer,

    // Config
    baselayers
  }
}
