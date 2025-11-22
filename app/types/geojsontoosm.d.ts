declare module 'geojsontoosm' {
  import type { FeatureCollection } from 'geojson'

  function geojsonToOsm(geojson: FeatureCollection): string

  export default geojsonToOsm
}
