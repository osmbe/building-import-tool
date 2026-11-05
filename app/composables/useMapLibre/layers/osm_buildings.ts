import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from "maplibre-gl";
import { hslVar } from "~/lib/utils";
import { useRuntimeConfig } from "#app";

export const loadOSMBuildingsLayer = (map: Map): string[] => {
    const config = useRuntimeConfig();

    const fillColor = hslVar('--layer-osm', 0.30)
    const strokeColor = hslVar('--layer-osm', 1)

    map.addSource('osm_buildings', {
        attribution: '© OpenStreetMap contributors',
        type: 'vector',
        url: `${config.public.baseURL}/tiles/osm/osm_buildings`,
    } as SourceSpecification);

    map.addLayer({
        id: 'osm_buildings-fill',
        source: 'osm_buildings',
        "source-layer": "osm_buildings",
        type: "fill",
        'paint': {
            'fill-color': fillColor,
            'fill-opacity': 0.6,
        }
    } as LayerSpecification);
    map.addLayer({
        id: 'osm_buildings-line',
        source: 'osm_buildings',
        "source-layer": "osm_buildings",
        type: "line",
        'paint': {
            'line-color': strokeColor,
            'line-width': 2,
        }
    } as LayerSpecification, "osm_buildings-fill");

    return ['osm_buildings-fill', 'osm_buildings-line']
}
