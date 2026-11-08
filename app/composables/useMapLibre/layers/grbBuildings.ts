import type { Map } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'
import { useRuntimeConfig } from '#app'

export const loadGrbBuildingsLayer = (map: Map): string[] => {
  if (typeof map.getSource('grb-buildings') !== 'undefined') return ['grb-buildings-fill', 'grb-buildings-line']

  const config = useRuntimeConfig()

  const fillColor = hslVar('--layer-grb', 0.3)
  const strokeColor = hslVar('--layer-grb', 1)

  map.addSource('grb-buildings', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/grb/candidates`
  })

  map.addLayer({
    id: 'grb-buildings-fill',
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0.6
    },
    source: 'grb-buildings',
    'source-layer': 'candidates',
    type: 'fill'
  })
  map.addLayer(
    {
      id: 'grb-buildings-line',
      paint: {
        'line-color': strokeColor,
        'line-width': 2
      },
      source: 'grb-buildings',
      'source-layer': 'candidates',
      type: 'line'
    },
    'grb-buildings-fill'
  )

  return ['grb-buildings-fill', 'grb-buildings-line']
}
