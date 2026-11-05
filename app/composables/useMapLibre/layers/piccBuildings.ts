import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from "maplibre-gl";
import { hslVar } from "~/lib/utils";
import { useRuntimeConfig } from "#app";

export const loadPiccBuildingsLayer = (map: Map): string[] => {
  const config = useRuntimeConfig();

  const fillColor = hslVar('--layer-picc', 0.30)
  const strokeColor = hslVar('--layer-picc', 1)

  map.addSource('picc-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/picc/candidates`,
  } as SourceSpecification);

  map.addLayer({
    id: 'picc-buildings-fill',
    source: 'picc-buildings',
    "source-layer": "candidates",
    type: "fill",
    'paint': {
      'fill-color': fillColor,
      'fill-opacity': 0.6,
    }
  } as LayerSpecification);
  map.addLayer({
    id: 'picc-buildings-line',
    source: 'picc-buildings',
    "source-layer": "candidates",
    type: "line",
    'paint': {
      'line-color': strokeColor,
      'line-width': 2,
    }
  } as LayerSpecification, "picc-buildings-fill");

  return ['picc-buildings-fill', 'picc-buildings-line']
}
