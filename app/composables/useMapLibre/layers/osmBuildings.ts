import type { Map } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'
import { useRuntimeConfig } from '#app'

export const loadOSMBuildingsLayer = (map: Map): string[] => {
  if (typeof map.getSource('osm-buildings') !== 'undefined') return ['osm-buildings-fill', 'osm-buildings-line']

  const config = useRuntimeConfig()

  const fillColor = hslVar('--layer-osm', 0.3)
  const strokeColor = hslVar('--layer-osm', 1)

  map.addSource('osm-buildings', {
    attribution: '© OpenStreetMap contributors',
    type: 'vector',
    url: `${config.public.baseURL}/tiles/osm/osm_buildings`
  })

  map.addLayer({
    id: 'osm-buildings-fill',
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0.6
    },
    source: 'osm-buildings',
    'source-layer': 'osm_buildings',
    type: 'fill'
  })
  map.addLayer(
    {
      id: 'osm-buildings-line',
      paint: {
        'line-color': strokeColor,
        'line-width': 2
      },
      source: 'osm-buildings',
      'source-layer': 'osm_buildings',
      type: 'line'
    },
    'osm-buildings-fill'
  )

  return ['osm-buildings-fill', 'osm-buildings-line']
}
