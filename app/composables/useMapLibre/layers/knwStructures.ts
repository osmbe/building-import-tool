import type { LayerSpecification, Map, SourceSpecification, StyleLayer } from 'maplibre-gl'
import { hslVar } from '~/lib/utils'
import { useRuntimeConfig } from '#app'

export const loadKnwStructuresLayer = (map: Map): string[] => {
  const config = useRuntimeConfig()

  const fillColor = hslVar('--layer-knw', 0.3)
  const strokeColor = hslVar('--layer-knw', 1)

  map.addSource('knw-structures', {
    type: 'vector',
    url: `${config.public.baseURL}/tiles/grb/knw_candidates`
  })

  map.addLayer({
    id: 'knw-structures-fill',
    paint: {
      'fill-color': fillColor,
      'fill-opacity': 0.6
    },
    source: 'knw-structures',
    'source-layer': 'knw_candidates',
    type: 'fill'
  })
  map.addLayer(
    {
      id: 'knw-structures-line',
      paint: {
        'line-color': strokeColor,
        'line-width': 2
      },
      source: 'knw-structures',
      'source-layer': 'knw_candidates',
      type: 'line'
    },
    'knw-structures-fill'
  )

  return ['knw-structures-fill', 'knw-structures-line']
}
