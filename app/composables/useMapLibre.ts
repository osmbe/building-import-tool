import { AttributionControl, Map, type MapOptions, NavigationControl, type RasterSourceSpecification, setWorkerUrl, type SourceSpecification } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { baselayers } from './useMapLibre/baselayers';

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

  const switchBaseLayer = (key: keyof typeof baselayers) => {
    map.value?.setStyle(baselayers[key]?.style ?? null)

    currentBaseLayer.value = key
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
    destroy,

    // Config
    baselayers
  }
}