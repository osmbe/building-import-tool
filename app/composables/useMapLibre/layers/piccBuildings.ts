import type { Map } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'
import { useRuntimeConfig } from '#app'

export const loadPiccBuildingsLayer = (map: Map): string[] => {
  if (typeof map.getSource('picc-buildings') !== 'undefined') return ['picc-buildings-fill', 'picc-buildings-line']

  const config = useRuntimeConfig()

  const fillColor = hslVar('--layer-picc', 0.3)
  const strokeColor = hslVar('--layer-picc', 1)

  map.addSource('picc-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/picc/candidates`
  })

  map.addLayer({
    id: 'picc-buildings-fill',
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0.6
    },
    source: 'picc-buildings',
    'source-layer': 'candidates',
    type: 'fill'
  })
  map.addLayer(
    {
      id: 'picc-buildings-line',
      paint: {
        'line-color': strokeColor,
        'line-width': 2
      },
      source: 'picc-buildings',
      'source-layer': 'candidates',
      type: 'line'
    },
    'picc-buildings-fill'
  )

  return ['picc-buildings-fill', 'picc-buildings-line']
}
