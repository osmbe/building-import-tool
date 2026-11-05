import { AttributionControl, type LayerSpecification, Map, type MapOptions, NavigationControl, type RasterSourceSpecification, setWorkerUrl, type SourceSpecification, type StyleLayer } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { baselayers } from './useMapLibre/baselayers';
import { loadOSMBuildingsLayer } from './useMapLibre/layers/osmBuildings';
import { loadGrbBuildingsLayer } from './useMapLibre/layers/grbBuildings';

setWorkerUrl(workerUrl);

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
      container: target,
      center: [0, 0],
      zoom: 1,
      attributionControl: false
    };

    const mapInstance = new Map({ ...defaultOptions, ...options });

    mapInstance.addControl(new NavigationControl(), 'top-left');
    mapInstance.addControl(new AttributionControl({ compact: true }), 'top-right');

    Object.keys(baselayers).forEach(key => {
      if (currentBaseLayer.value === key) {
        mapInstance.setStyle(baselayers[key]?.style ?? null);
      }
    });

    map.value = mapInstance;

    return mapInstance;
  }

  // Switch the base layer of the map
  const switchBaseLayer = (key: keyof typeof baselayers) => {
    map.value?.setStyle(
      baselayers[key]?.style ?? null, {
      // Merge overlay sources + layers into the incoming base style
      transformStyle: (previousStyle, nextStyle) => {
        nextStyle.sources = { ...nextStyle.sources };
        nextStyle.layers = [...nextStyle.layers];

        if (typeof previousStyle !== 'undefined') {
          const overlaySources = ['osm_buildings'];

          for (const source of overlaySources) {
            if (source in previousStyle.sources && !(source in nextStyle.sources)) {
              nextStyle.sources[source] = previousStyle.sources[source];
              nextStyle.layers.push(...previousStyle.layers.filter(layer => layer.source === source));
            }
          }
        }

        return nextStyle;
      }
    })

    currentBaseLayer.value = key
  }

  // Get current zoom level
  const getZoomLevel = () => Math.floor(map.value?.getZoom()) + 1

  // Set Layer visibility
  const setLayersVisibility = (layersId: string[], visible: boolean) => {
    if (!map.value || layersId.length === 0) return

    for (const layerId of layersId) {
      map.value.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }

  // Cleanup
  const destroy = () => {
    if (map.value) {
      // map.value.setTarget(undefined)
      map.value = null
    }
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

    // Config
    baselayers
  }
}