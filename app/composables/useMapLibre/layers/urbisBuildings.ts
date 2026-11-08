import type { Map } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'
import { useRuntimeConfig } from '#app'

export const loadUrbisBuildingsLayer = (map: Map): string[] => {
  const config = useRuntimeConfig()

  const fillColor = hslVar('--layer-urbis', 0.3)
  const strokeColor = hslVar('--layer-urbis', 1)

  map.addSource('urbis-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/urbis/candidates`
  })

  map.addLayer({
    id: 'urbis-buildings-fill',
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0.6
    },
    source: 'urbis-buildings',
    'source-layer': 'candidates',
    type: 'fill'
  })
  map.addLayer(
    {
      id: 'urbis-buildings-line',
      paint: {
        'line-color': strokeColor,
        'line-width': 2
      },
      source: 'urbis-buildings',
      'source-layer': 'candidates',
      type: 'line'
    },
    'urbis-buildings-fill'
  )

  return ['urbis-buildings-fill', 'urbis-buildings-line']
}
