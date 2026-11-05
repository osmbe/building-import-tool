import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from "maplibre-gl";
import { hslVar } from "~/lib/utils";
import { useRuntimeConfig } from "#app";

export const loadGrbBuildingsLayer = (map: Map): string[] => {
  const config = useRuntimeConfig();

  const fillColor = hslVar('--layer-grb', 0.30)
  const strokeColor = hslVar('--layer-grb', 1)

  map.addSource('grb-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/grb/candidates`,
  } as SourceSpecification);

  map.addLayer({
    id: 'grb-buildings-fill',
    source: 'grb-buildings',
    "source-layer": "candidates",
    type: "fill",
    'paint': {
      'fill-color': fillColor,
      'fill-opacity': 0.6,
    }
  } as LayerSpecification);
  map.addLayer({
    id: 'grb-buildings-line',
    source: 'grb-buildings',
    "source-layer": "candidates",
    type: "line",
    'paint': {
      'line-color': strokeColor,
      'line-width': 2,
    }
  } as LayerSpecification, "grb-buildings-fill");

  return ['grb-buildings-fill', 'grb-buildings-line']
}
