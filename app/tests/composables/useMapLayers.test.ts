import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type BaseLayer from 'ol/layer/Base'
import { toLonLat } from 'ol/proj'
import TileWMS from 'ol/source/TileWMS'
import WMTS from 'ol/source/WMTS'
import XYZ from 'ol/source/XYZ'

// Ol/Map needs a DOM; layers, sources and views work in node, so only the map is faked.
const maps = vi.hoisted(() => ({ instances: [] as any[] }))
vi.mock('ol/Map', () => ({
  default: class FakeMap {
    options: any
    layers: BaseLayer[] = []
    handlers: Record<string, () => void> = {}
    viewport: unknown = null
    render = vi.fn()
    setTarget = vi.fn()
    constructor(options: any) {
      this.options = options
      maps.instances.push(this)
    }
    addLayer(layer: BaseLayer) {
      this.layers.push(layer)
    }
    getViewport() {
      return this.viewport
    }
    once(type: string, handler: () => void) {
      this.handlers[type] = handler
    }
  }
}))

const { useMapLayers } = await import('~/composables/useMapLayers')

const target = {} as HTMLElement
const titles = (map: any) => map.layers.map((l: BaseLayer) => l.get('title'))
const visibleTitles = (map: any) =>
  map.layers.filter((l: BaseLayer) => l.getVisible()).map((l: BaseLayer) => l.get('title'))

describe('useMapLayers', () => {
  beforeEach(() => {
    maps.instances.length = 0
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('creates the map centred on Belgium with all base layers and only OSM visible', () => {
    const { initializeMap, map, currentBaseLayer } = useMapLayers()
    const instance = initializeMap(target) as any

    // Map is a deep ref, so map.value is a reactive proxy of the OL map
    expect(map.value).toBe(instance)
    expect(instance.options.target).toBe(target)
    expect(instance.options.controls).toEqual([])
    const {view} = instance.options
    const [lon = 0, lat = 0] = toLonLat(view.getCenter())
    expect(lon).toBeCloseTo(4.3047, 4)
    expect(lat).toBeCloseTo(50.9087, 4)
    expect(view.getZoom()).toBe(13)
    expect(view.getMaxZoom()).toBe(19)
    expect(view.getMinZoom()).toBe(3)

    expect(titles(instance)).toEqual([
      'OpenStreetMap Belgium',
      'Flanders Orthophoto',
      'Wallonia Orthophoto 2024',
      'Brussels Orthophoto 2024',
      'Esri World Imagery'
    ])
    expect(instance.layers.every((l: BaseLayer) => l.get('type') === 'base')).toBe(true)
    expect(visibleTitles(instance)).toEqual(['OpenStreetMap Belgium'])
    expect(currentBaseLayer.value).toBe('osm')
  })

  it('configures the base layer sources', () => {
    const instance = useMapLayers().initializeMap(target) as any
    const [osm, flanders, wallonia, brussels, esri] = instance.layers.map((l: any) => l.getSource())

    expect(osm).toBeInstanceOf(XYZ)
    expect(osm.getUrls()).toEqual(['https://tile.openstreetmap.be/osmbe/{z}/{x}/{y}.png'])
    expect(flanders).toBeInstanceOf(WMTS)
    expect(flanders.getLayer()).toBe('ofw')
    expect(flanders.getMatrixSet()).toBe('GoogleMapsVL')
    expect(flanders.getTileGrid().getResolutions()).toHaveLength(19)
    expect(wallonia).toBeInstanceOf(TileWMS)
    expect(wallonia.getParams()).toMatchObject({ LAYERS: '0', VERSION: '1.3.0' })
    // Brussels goes through the server-side proxy
    expect(brussels.getUrls()).toEqual(['/api/proxy/brussels-wms'])
    expect(brussels.getParams()).toMatchObject({ LAYERS: 'Ortho2024Ns' })
    expect(esri).toBeInstanceOf(XYZ)
    // Esri imagery is restricted to Belgium
    const extent = instance.layers[4].getExtent()
    expect(extent).toHaveLength(4)
  })

  it('applies a custom view config', () => {
    const instance = useMapLayers().initializeMap(target, { center: [5, 51], minZoom: 6, zoom: 8 }) as any
    const {view} = instance.options
    const [lon = 0, lat = 0] = toLonLat(view.getCenter())
    expect(lon).toBeCloseTo(5, 6)
    expect(lat).toBeCloseTo(51, 6)
    expect(view.getZoom()).toBe(8)
    expect(view.getMinZoom()).toBe(6)
    expect(view.getMaxZoom()).toBe(19)
  })

  it('returns the existing map when initialised twice', () => {
    const { initializeMap } = useMapLayers()
    const first = initializeMap(target)
    expect(initializeMap(target)).toBe(first)
    expect(maps.instances).toHaveLength(1)
    expect(console.warn).toHaveBeenCalledWith('Map already initialized')
  })

  it('asks the canvases for willReadFrequently after the first render', () => {
    const instance = useMapLayers().initializeMap(target) as any
    const canvas = { getContext: vi.fn() }
    instance.viewport = { querySelectorAll: vi.fn(() => [canvas, canvas]) }

    instance.handlers.postrender()

    expect(instance.viewport.querySelectorAll).toHaveBeenCalledWith('canvas')
    expect(canvas.getContext).toHaveBeenCalledTimes(2)
    expect(canvas.getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })

    // No viewport: nothing to patch
    instance.viewport = null
    expect(() => instance.handlers.postrender()).not.toThrow()
  })

  it.each([
    ['osm', ['OpenStreetMap Belgium']],
    ['flanders', ['Flanders Orthophoto']],
    ['wallonia', ['Wallonia Orthophoto 2024']],
    ['brussels', ['Brussels Orthophoto 2024']],
    ['esri', ['Esri World Imagery']],
    ['blank', []]
  ] as const)('switches the base layer to %s exclusively', (name, expected) => {
    const { initializeMap, switchBaseLayer, currentBaseLayer } = useMapLayers()
    const instance = initializeMap(target) as any
    switchBaseLayer('flanders')

    switchBaseLayer(name)

    expect(visibleTitles(instance)).toEqual(expected)
    expect(currentBaseLayer.value).toBe(name)
    expect(instance.render).toHaveBeenCalled()
  })

  it('ignores base layer switches before the map exists', () => {
    const { switchBaseLayer, currentBaseLayer } = useMapLayers()
    switchBaseLayer('esri')
    expect(currentBaseLayer.value).toBe('osm')
    expect(console.warn).toHaveBeenCalledWith('Layers or map not initialized')
  })

  it('detaches the map on destroy', () => {
    const { initializeMap, destroy, map, switchBaseLayer } = useMapLayers()
    const instance = initializeMap(target) as any

    destroy()
    expect(instance.setTarget).toHaveBeenCalledWith(undefined)
    expect(map.value).toBeNull()

    // Layers survive, but there is no map to switch on anymore
    switchBaseLayer('esri')
    expect(console.warn).toHaveBeenCalledWith('Layers or map not initialized')
    expect(() =>{  destroy(); }).not.toThrow()
  })
})
