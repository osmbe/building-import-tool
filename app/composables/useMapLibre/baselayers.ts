import type { StyleSpecification } from 'maplibre-gl'
import blankStyle from './baselayers/blank.json'
import bruOrthoWMSStyle from './baselayers/bru-ortho-wms.json'
import osmbeStyle from './baselayers/osmbe.json'
import vlaOrthoWMTSStyle from './baselayers/vla-ortho-wmts.json'
import walOrthoWMSStyle from './baselayers/wal-ortho-wms.json'

interface SourceConfig {
  label: string
  comment?: string
  title?: string
  style: StyleSpecification | string | null
}

export const baselayers: Record<string, SourceConfig> = {
  // Blank
  blank: {
    label: 'Blank',
    style: blankStyle as StyleSpecification
  },
  // OpenStreetMap Belgium
  osmbe: {
    comment: 'BE',
    label: 'OSM',
    style: osmbeStyle as StyleSpecification,
    title: 'OpenStreetMap Belgium TileServers'
  },
  // OpenFreeMap
  openfreemap: {
    label: 'OpenFreeMap',
    style: 'https://tiles.openfreemap.org/styles/liberty'
  },
  // Shortbread
  shortbread: {
    label: 'Shortbread',
    style: 'https://vector.openstreetmap.org/styles/shortbread/graybeard.json'
  },
  // Vlaanderen (Flanders) orthophotos
  'vla-ortho-wmts': {
    comment: 'latest',
    label: 'Flanders',
    style: vlaOrthoWMTSStyle as StyleSpecification,
    title: 'Orthophoto Flanders — Digitaal Vlaanderen (OFW, always latest)'
  },
  // Wallonie (Wallonia) orthophotos
  'wal-ortho-wms': {
    comment: 'latest',
    label: 'Wallonia',
    style: walOrthoWMSStyle as StyleSpecification,
    title: 'Orthophoto Wallonia — Service Public de Wallonie (ORTHO_LATEST, always latest)'
  },
  // Bruxelles/Brussel (Brussels) orthophotos
  'bru-ortho-wms': {
    comment: 'latest',
    label: 'Brussels',
    style: bruOrthoWMSStyle as StyleSpecification,
    title: 'Orthophoto Brussels — Paradigm (Ortho, always latest)'
  }
}
