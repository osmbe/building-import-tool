export interface VectorTileBounds {
  minLon: number
  minLat: number
  maxLon: number
  maxLat: number
  zoom?: number
}

export interface MartinDataSource {
  name: string
  url: string
  layer: string
  format?: 'mvt' | 'geojson'
}

export function useVectorData() {
  // Configure your Martin docker endpoints here
  const MARTIN_GRB_URL = 'http://127.0.0.1:3001' // GRB data on port 3001
  const MARTIN_OSM_URL = 'http://127.0.0.1:3002' // OSM data on port 3002

  const defaultSources: MartinDataSource[] = [
    {
      name: 'buildings',
      url: `${MARTIN_GRB_URL}/buildings`,
      layer: 'buildings',
      format: 'geojson'
    },
    {
      name: 'addresses',
      url: `${MARTIN_GRB_URL}/addresses`,
      layer: 'addresses',
      format: 'geojson'
    }
  ]

  async function fetchVectorTileData(
    source: MartinDataSource, 
    bounds: VectorTileBounds
  ): Promise<any> {
    try {
      const params = new URLSearchParams({
        bbox: `${bounds.minLon},${bounds.minLat},${bounds.maxLon},${bounds.maxLat}`,
        limit: '10000' // Adjust as needed
      })

      if (bounds.zoom) {
        params.append('zoom', bounds.zoom.toString())
      }

      const url = `${source.url}?${params.toString()}`

      const response = await fetch(url, {
        headers: {
          'Accept': source.format === 'geojson' ? 'application/json' : 'application/x-protobuf'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`)
      }

      if (source.format === 'geojson') {
        return await response.json()
      } else {
        // Handle MVT format if needed
        return await response.arrayBuffer()
      }
    } catch (error) {
      console.error(`Error fetching data from ${source.name}:`, error)
      throw error
    }
  }

  async function fetchAllVectorData(
    sources: MartinDataSource[],
    bounds: VectorTileBounds
  ): Promise<{ [key: string]: any }> {
    const results: { [key: string]: any } = {}

    await Promise.allSettled(
      sources.map(async (source) => {
        try {
          const data = await fetchVectorTileData(source, bounds)
          results[source.name] = data
        } catch (error) {
          console.warn(`Failed to fetch ${source.name}:`, error)
          results[source.name] = null
        }
      })
    )

    return results
  }

  function combineGeoJSONFeatures(datasets: { [key: string]: any }): any {
    const combined = {
      type: 'FeatureCollection',
      features: []
    }

    Object.entries(datasets).forEach(([name, data]) => {
      if (data && data.features) {
        // Add source information to each feature
        const featuresWithSource = data.features.map((feature: any) => ({
          ...feature,
          properties: {
            ...feature.properties,
            source: name
          }
        }))
        combined.features.push(...featuresWithSource)
      }
    })

    return combined
  }

  async function getDataForBounds(
    bounds: VectorTileBounds,
    sources: MartinDataSource[] = defaultSources
  ): Promise<any> {
    const datasets = await fetchAllVectorData(sources, bounds)
    return combineGeoJSONFeatures(datasets)
  }

  function createMartinSource(
    name: string,
    endpoint: string,
    layer: string,
    format: 'mvt' | 'geojson' = 'geojson',
    baseUrl?: string
  ): MartinDataSource {
    // Determine base URL: use provided baseUrl, or auto-detect based on endpoint name
    let url: string
    if (baseUrl) {
      url = `${baseUrl}/${endpoint}`
    } else if (endpoint.includes('osm')) {
      url = `${MARTIN_OSM_URL}/${endpoint}`
    } else {
      url = `${MARTIN_GRB_URL}/${endpoint}`
    }

    return {
      name,
      url,
      layer,
      format
    }
  }

  return {
    fetchVectorTileData,
    fetchAllVectorData,
    combineGeoJSONFeatures,
    getDataForBounds,
    createMartinSource,
    defaultSources,
    MARTIN_GRB_URL,
    MARTIN_OSM_URL
  }
}