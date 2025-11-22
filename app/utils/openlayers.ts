import GeoJSON from 'ol/format/GeoJSON'
import type VectorLayer from 'ol/layer/Vector'
import type VectorSource from 'ol/source/Vector'
import type { Feature } from 'geojson'

/**
 * Extract GeoJSON features from OpenLayers vector layer
 */
export const extractFeaturesFromLayer = (
  layer: VectorLayer<VectorSource>,
  targetProjection: string = 'EPSG:4326'
): Feature[] => {
  const source = layer.getSource()
  if (!source) {
    return []
  }

  const features = source.getFeatures()
  const geoJsonFormat = new GeoJSON()

  return features.map(feature => {
    const geoJsonFeature = geoJsonFormat.writeFeatureObject(feature, {
      dataProjection: targetProjection,
      featureProjection: 'EPSG:3857' // Web Mercator (default OpenLayers projection)
    })
    return geoJsonFeature as Feature
  })
}

/**
 * Extract GeoJSON features from OpenLayers vector source
 */
export const extractFeaturesFromSource = (
  source: VectorSource,
  sourceProjection: string = 'EPSG:3857',
  targetProjection: string = 'EPSG:4326'
): Feature[] => {
  const features = source.getFeatures()
  const geoJsonFormat = new GeoJSON()

  return features.map(feature => {
    const geoJsonFeature = geoJsonFormat.writeFeatureObject(feature, {
      dataProjection: targetProjection,
      featureProjection: sourceProjection
    })
    return geoJsonFeature as Feature
  })
}
