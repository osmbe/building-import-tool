import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from "maplibre-gl";
import { hslVar } from "~/lib/utils";
import { useRuntimeConfig } from "#app";

export const loadKnwStructuresLayer = (map: Map): string[] => {
  const config = useRuntimeConfig();

  const fillColor = hslVar('--layer-knw', 0.30)
  const strokeColor = hslVar('--layer-knw', 1)

  map.addSource('knw-structures', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/grb/knw_candidates`,
  } as SourceSpecification);

  map.addLayer({
    id: 'knw-structures-fill',
    source: 'knw-structures',
    "source-layer": "knw_candidates",
    type: "fill",
    'paint': {
      'fill-color': fillColor,
      'fill-opacity': 0.6,
    }
  } as LayerSpecification);
  map.addLayer({
    id: 'knw-structures-line',
    source: 'knw-structures',
    "source-layer": "knw_candidates",
    type: "line",
    'paint': {
      'line-color': strokeColor,
      'line-width': 2,
    }
  } as LayerSpecification, "knw-structures-fill");

  return ['knw-structures-fill', 'knw-structures-line']
}
