import { type ProjectionLike, fromLonLat, get as getProjection, transformExtent } from 'ol/proj'
import { type Ref, ref } from 'vue'
import { getTopLeft, getWidth } from 'ol/extent'
import OLMap from 'ol/Map'
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'
import View from 'ol/View'
import WMTS from 'ol/source/WMTS'
import WMTSTileGrid from 'ol/tilegrid/WMTS'
import XYZ from 'ol/source/XYZ'

// Types
export interface BaseLayerConfig {
  id: string
  name: string
  type: 'osm' | 'wmts' | 'xyz' | 'vector'
  visible?: boolean
  options?: any
}

export interface MapConfig {
  center?: [number, number]
  zoom?: number
  maxZoom?: number
  minZoom?: number
  projection?: ProjectionLike
}

// Main composable
export const useMapLayers = () => {
  const map = ref<OLMap | null>(null)
  const currentBaseLayer = ref<'osm' | 'flanders' | 'wallonia' | 'brussels' | 'esri' | 'blank'>('osm')
  const osmLayer = ref<TileLayer<XYZ>>()
  const flandersLayer = ref<TileLayer<WMTS>>()
  const walloniaLayer = ref<TileLayer<TileWMS>>()
  const brusselsLayer = ref<TileLayer<TileWMS>>()
  const esriLayer = ref<TileLayer<XYZ>>()

  // Initialize layers first (separate from map creation)
  const initializeLayers = () => {
    // OSM Belgium layer - visible by default
    osmLayer.value = new TileLayer({
      source: new XYZ({
        url: 'https://tile.openstreetmap.be/osmbe/{z}/{x}/{y}.png',
        attributions: '© OpenStreetMap contributors, tiles courtesy of GEO-6'
      }),
      visible: true,
      properties: {
        title: 'OpenStreetMap Belgium',
        type: 'base'
      }
    })

    // Flanders WMTS layer - hidden by default
    const projection = getProjection('EPSG:3857')!
    const projectionExtent = projection.getExtent()
    const size = getWidth(projectionExtent) / 256
    const resolutions = new Array(19)
    const matrixIds = new Array(19)

    for (let z = 0; z < 19; ++z) {
      resolutions[z] = size / 2 ** z
      matrixIds[z] = z.toString()
    }

    flandersLayer.value = new TileLayer({
      source: new WMTS({
        url: 'https://geo.api.vlaanderen.be/OFW/wmts',
        layer: 'ofw',
        matrixSet: 'GoogleMapsVL',
        format: 'image/png',
        projection: projection,
        tileGrid: new WMTSTileGrid({
          origin: getTopLeft(projectionExtent),
          resolutions: resolutions,
          matrixIds: matrixIds
        }),
        style: 'default',
        wrapX: true
      }),
      visible: false,
      properties: {
        title: 'Flanders Orthophoto',
        type: 'base'
      }
    })

    // Wallonia WMS layer - hidden by default (2024 version)
    walloniaLayer.value = new TileLayer({
      source: new TileWMS({
        url: 'https://geoservices.wallonie.be/arcgis/services/IMAGERIE/ORTHO_2024/MapServer/WMSServer',
        params: {
          'LAYERS': '0',
          'TILED': true,
          'VERSION': '1.3.0',
          'FORMAT': 'image/png'
        },
        serverType: 'mapserver',
        crossOrigin: 'anonymous'
      }),
      visible: false,
      properties: {
        title: 'Wallonia Orthophoto 2024',
        type: 'base'
      }
    })

    // Esri World Imagery - hidden by default, restricted to Belgium extent
    const belgiumExtent = transformExtent([2.54, 49.49, 6.41, 51.51], 'EPSG:4326', 'EPSG:3857')
    esriLayer.value = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
        maxZoom: 19
      }),
      extent: belgiumExtent,
      visible: false,
      properties: {
        title: 'Esri World Imagery',
        type: 'base'
      }
    })

    // Brussels WMS layer - hidden by default (2024 version, nadir/vertical)
    brusselsLayer.value = new TileLayer({
      source: new TileWMS({
        url: '/api/proxy/brussels-wms',
        params: {
          'LAYERS': 'Ortho2024Ns',
          'TILED': true,
          'VERSION': '1.1.1',
          'FORMAT': 'image/jpeg'
        },
        serverType: 'geoserver',
        crossOrigin: 'anonymous'
      }),
      visible: false,
      properties: {
        title: 'Brussels Orthophoto 2024',
        type: 'base'
      }
    })
  }

  // Initialize map
  const initializeMap = (
    target: HTMLElement,
    config: MapConfig = {}
  ): OLMap => {
    if (map.value) {
      console.warn('Map already initialized')
      return map.value as OLMap
    }

    // Default config
    const defaultConfig: MapConfig = {
      center: [4.3047, 50.9087], // Belgium center
      zoom: 13,
      maxZoom: 19,
      minZoom: 3,
      projection: 'EPSG:3857'
    }

    const finalConfig = { ...defaultConfig, ...config }

    // Create map first (empty)
    const mapInstance = new OLMap({
      target: target,
      layers: [],
      view: new View({
        center: fromLonLat(finalConfig.center!),
        zoom: finalConfig.zoom,
        maxZoom: finalConfig.maxZoom,
        minZoom: finalConfig.minZoom,
        projection: finalConfig.projection
      }),
      // Add context options to reduce Canvas2D warnings
      // This tells the browser we'll be reading from canvas frequently (for hit detection)
      controls: []
    })

    // Patch canvas contexts to set willReadFrequently
    // This is needed for OpenLayers hit detection to avoid Canvas2D warnings
    const patchCanvasContexts = () => {
      const viewport = mapInstance.getViewport()
      if (viewport) {
        const canvases = viewport.querySelectorAll('canvas')
        for (const canvas of canvases) {
          canvas.getContext('2d', { willReadFrequently: true })
        }
      }
    }
    mapInstance.once('postrender', patchCanvasContexts)

    map.value = mapInstance

    // Now initialize and add layers to the map
    initializeLayers()

    // Add layers to map
    map.value.addLayer(osmLayer.value!)
    map.value.addLayer(flandersLayer.value!)
    map.value.addLayer(walloniaLayer.value!)
    map.value.addLayer(brusselsLayer.value!)
    map.value.addLayer(esriLayer.value!)

    return mapInstance
  }

  // Switch base layer following OpenLayers best practices
  const switchBaseLayer = (layerName: 'osm' | 'flanders' | 'wallonia' | 'brussels' | 'esri' | 'blank') => {
    if (!osmLayer.value || !flandersLayer.value || !walloniaLayer.value || !brusselsLayer.value || !esriLayer.value || !map.value) {
      console.warn('Layers or map not initialized')
      return
    }

    // Hide all base layers first (mutual exclusivity)
    osmLayer.value.setVisible(false)
    flandersLayer.value.setVisible(false)
    walloniaLayer.value.setVisible(false)
    brusselsLayer.value.setVisible(false)
    esriLayer.value.setVisible(false)

    // Show selected layer (or keep all hidden for blank)
    if (layerName === 'osm') {
      osmLayer.value.setVisible(true)
    } else if (layerName === 'flanders') {
      flandersLayer.value.setVisible(true)
    } else if (layerName === 'wallonia') {
      walloniaLayer.value.setVisible(true)
    } else if (layerName === 'brussels') {
      brusselsLayer.value.setVisible(true)
    } else if (layerName === 'esri') {
      esriLayer.value.setVisible(true)
    }
    // For 'blank', all layers stay hidden

    // Update current state
    currentBaseLayer.value = layerName

    // Force map render
    map.value.render()
  }

  // Cleanup
  const destroy = () => {
    if (map.value) {
      map.value.setTarget(undefined)
      map.value = null
    }
  }

  return {
    // State
    map: map as Ref<OLMap | null>,
    currentBaseLayer,

    // Methods
    initializeMap,
    switchBaseLayer,
    destroy
  }
}