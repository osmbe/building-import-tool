import { AttributionControl, Map, type MapOptions, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);

export const useMapLibre = () => {
  const map = shallowRef<Map | null>(null)

  // Initialize map
  const initializeMap = (target: HTMLElement, options: MapOptions): Map => {
    if (map.value) {
      console.warn('Map already initialized')
      return map.value
    }

    const defaultOptions: MapOptions = {
      container: target,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [0, 0],
      zoom: 1,
      attributionControl: false
    };

    const mapInstance = new Map({ ...defaultOptions, ...options });

    map.value = mapInstance;
    map.value.addControl(new NavigationControl(), 'top-left');
    map.value.addControl(new AttributionControl({compact: true}), 'top-right');

    return mapInstance;
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
    // currentBaseLayer,

    // Methods
    initializeMap,
    // switchBaseLayer,
    destroy
  }
}