import {
  AttributionControl,
  Map,
  type MapGeoJSONFeature,
  type MapOptions,
  NavigationControl,
  setWorkerUrl
} from 'maplibre-gl'
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
  const currentZoom = ref(7)
  const currentCenter = ref<[number, number]>([4.3517, 50.8503])
  const currentHoveredFeature = shallowRef<MapGeoJSONFeature | undefined>(undefined)
  const currentClickedFeature = shallowRef<MapGeoJSONFeature | undefined>(undefined)
  const clickedFeatures = shallowRef<MapGeoJSONFeature[]>([])

  // Initialize map
  const initializeMap = (target: HTMLElement, options: MapOptions): void => {
    if (map.value) {
      console.warn('Map already initialized')
      return
    }

    const defaultOptions: MapOptions = {
      attributionControl: false,
      center: [0, 0],
      container: target,
      hash: true,
      minZoom: 7,
      zoom: 1,
      zoomSnap: 1
    }

    const mapInstance = new Map({ ...defaultOptions, ...options })

    mapInstance.addControl(new NavigationControl(), 'top-left')
    mapInstance.addControl(new AttributionControl({ compact: true }), 'top-right')

    Object.keys(baselayers).forEach((key) => {
      if (currentBaseLayer.value === key) mapInstance.setStyle(baselayers[key]?.style ?? null)
    })

    mapInstance.on('moveend', () => {
      const zoom = Math.floor(mapInstance.getZoom() ?? 0) + 1
      currentZoom.value = zoom

      const { lng, lat } = mapInstance.getCenter()
      currentCenter.value = [lng, lat]
    })

    mapInstance.on(
      'mousemove',
      ['osm-buildings-fill', 'grb-buildings-fill', 'picc-buildings-fill', 'urbis-buildings-fill'],
      (evt) => {
        if (typeof evt.features !== 'undefined' && evt.features.length > 0) {
          if (typeof currentHoveredFeature.value !== 'undefined') {
            mapInstance.setFeatureState(
              {
                id: currentHoveredFeature.value.id,
                source: currentHoveredFeature.value.source,
                sourceLayer: currentHoveredFeature.value.sourceLayer
              },
              { hover: false }
            )
            mapInstance.getCanvas().style.cursor = ''
          }

          if (typeof evt.features[0]?.id !== 'undefined') {
            currentHoveredFeature.value = evt.features[0]
            mapInstance.setFeatureState(
              { id: evt.features[0].id, source: evt.features[0].source, sourceLayer: evt.features[0].sourceLayer },
              { hover: true }
            )
            mapInstance.getCanvas().style.cursor = 'pointer'
          }
        }
      }
    )

    mapInstance.on(
      'mouseleave',
      ['osm-buildings-fill', 'grb-buildings-fill', 'picc-buildings-fill', 'urbis-buildings-fill'],
      () => {
        if (typeof currentHoveredFeature.value !== 'undefined')
          mapInstance.setFeatureState(
            {
              id: currentHoveredFeature.value.id,
              source: currentHoveredFeature.value.source,
              sourceLayer: currentHoveredFeature.value.sourceLayer
            },
            { hover: false }
          )

        currentHoveredFeature.value = undefined
        mapInstance.getCanvas().style.cursor = ''
      }
    )

    mapInstance.on(
      'click',
      ['osm-buildings-fill', 'grb-buildings-fill', 'picc-buildings-fill', 'urbis-buildings-fill'],
      (evt) => {
        if (typeof evt.features === 'undefined' || evt.features.length === 0) return

        clickedFeatures.value = evt.features

        if (typeof evt.features[0]?.id !== 'undefined') currentClickedFeature.value = evt.features[0]
      }
    )

    map.value = mapInstance
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
    currentZoom,
    currentCenter,
    currentHoveredFeature,
    currentClickedFeature,
    clickedFeatures,

    // Methods
    initializeMap,
    switchBaseLayer,
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
