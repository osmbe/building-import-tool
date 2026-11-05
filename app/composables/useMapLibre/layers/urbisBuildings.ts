import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from "maplibre-gl";
import { hslVar } from "~/lib/utils";
import { useRuntimeConfig } from "#app";

export const loadUrbisBuildingsLayer = (map: Map): string[] => {
  const config = useRuntimeConfig();

  const fillColor = hslVar('--layer-urbis', 0.30)
  const strokeColor = hslVar('--layer-urbis', 1)

  map.addSource('urbis-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/urbis/candidates`,
  } as SourceSpecification);

  map.addLayer({
    id: 'urbis-buildings-fill',
    source: 'urbis-buildings',
    "source-layer": "candidates",
    type: "fill",
    'paint': {
      'fill-color': fillColor,
      'fill-opacity': 0.6,
    }
  } as LayerSpecification);
  map.addLayer({
    id: 'urbis-buildings-line',
    source: 'urbis-buildings',
    "source-layer": "candidates",
    type: "line",
    'paint': {
      'line-color': strokeColor,
      'line-width': 2,
    }
  } as LayerSpecification, "urbis-buildings-fill");

  return ['urbis-buildings-fill', 'urbis-buildings-line']
}
