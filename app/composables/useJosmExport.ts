import type { Feature, FeatureCollection } from 'geojson'
import { geojsonToOsm } from '~/utils/geojsonToOsm'
import { candidateToOsmFeature } from '~/utils/candidates'

export const useJosmExport = () => {
  const josmBaseUrl = ref('http://127.0.0.1:8111')
  const useSSL = ref(false)

  // Update JOSM URL based on SSL preference
  const getJosmUrl = () => (useSSL.value ? 'https://127.0.0.1:8112' : 'http://127.0.0.1:8111')

  /**
   * Test if JOSM is running and compatible
   */
  const testJosmConnection = async (): Promise<boolean> => {
    try {
      const response = await fetch(`${getJosmUrl()}/version`, {
        method: 'GET'
      })

      if (!response.ok) return false

      const data = await response.json()
      const version = data.protocolversion

      if (version && version.minor < 6) {
        console.warn('JOSM version too old. Please update to version 7643 or newer')
        return false
      }

      return true
    } catch (error) {
      console.error('JOSM connection failed:', error)
      return false
    }
  }

  /**
   * Convert GeoJSON to OSM-XML
   */
  const convertToOsmXml = (geojson: FeatureCollection): string => {
    const osmXml = geojsonToOsm(geojson)

    if (!osmXml || osmXml.length === 0) throw new Error('geojsonToOsm generated empty output')

    return osmXml
  }

  /**
   * Export OpenLayers layer to JOSM
   */
  const exportLayerToJosm = async (
    features: Feature[],
    layerName = 'export-layer',
    options: {
      includeMeta?: boolean
      simplify?: boolean
      simplifyPercent?: number
      uploadToBackend?: boolean
      backendUrl?: string
    } = {}
  ) => {
    const {
      includeMeta = false,
      simplify = false,
      simplifyPercent = 85,
      uploadToBackend = false,
      backendUrl = '/api/export/upload'
    } = options

    // Check JOSM connection
    const isConnected = await testJosmConnection()
    if (!isConnected) throw new Error('JOSM is not running or not accessible')

    // Validate features
    if (!features || features.length === 0) throw new Error('No features to export')

    // Create GeoJSON FeatureCollection
    let geojson: FeatureCollection = {
      features: includeMeta ? features : features.map(candidateToOsmFeature),
      type: 'FeatureCollection'
    }

    // Optional: Simplify geometry using mapshaper
    if (simplify && simplifyPercent < 100)
      try {
        const mapshaper = await import('mapshaper')
        const dataset = mapshaper.internal.importGeoJSON(geojson, {})
        const simplified = mapshaper.simplify(dataset, {
          keep_shapes: true,
          method: 'dp',
          percentage: simplifyPercent / 100
        })

        const output = mapshaper.internal.exportFileContent(simplified, {
          format: 'geojson'
        })

        const content = output[0]?.content
        if (!content) throw new Error('Mapshaper returned no output')
        geojson = JSON.parse(content)
      } catch (err) {
        console.warn('Mapshaper simplification failed, exporting without simplification:', err)
      }

    // Convert to OSM-XML
    const osmXml = convertToOsmXml(geojson)

    // Check if data is too large for direct transfer
    const testParams = new URLSearchParams({
      data: osmXml,
      layer_name: layerName,
      new_layer: 'true',
      upload_policy: 'never'
    })
    const testUrl = `${getJosmUrl()}/load_data?${testParams.toString()}`
    // Use a higher threshold - most browsers and JOSM support URLs up to 32KB
    const useFallback = testUrl.length > 30000

    let fileUrl: string | null = null

    // Use backend upload for large exports, then fetch and send via load_data
    if (useFallback || uploadToBackend)
      try {
        const response = await $fetch<any>(backendUrl, {
          body: osmXml,
          headers: {
            'Content-Type': 'application/xml'
          },
          method: 'POST'
        })

        // Build URL using browser's protocol to avoid mixed content issues
        const filename = response.fname
        const browserProtocol = window.location.protocol
        const browserHost = window.location.host
        fileUrl = `${browserProtocol}//${browserHost}/exports/${filename}`

        // Fetch the file content ourselves
        const fileResponse = await fetch(fileUrl)
        if (!fileResponse.ok) throw new Error(`Failed to fetch uploaded file: ${fileResponse.status}`)

        const fileContent = await fileResponse.text()

        // Send the actual data to JOSM via /load_data endpoint
        const josmUrl = `${getJosmUrl()}/load_data`
        const params = new URLSearchParams({
          data: fileContent,
          layer_name: layerName,
          new_layer: 'true',
          upload_policy: 'never'
        })

        const importResponse = await fetch(`${josmUrl}?${params.toString()}`, {
          method: 'GET'
        })

        const responseText = await importResponse.text()

        if (!importResponse.ok) throw new Error(`JOSM import failed (${importResponse.status}): ${responseText}`)

        return {
          featureCount: features.length,
          fileUrl,
          method: 'backend-upload',
          success: true
        }
      } catch (error: any) {
        console.error('Failed to upload to backend:', error)
        throw new Error(`Backend upload failed: ${error.message}`, { cause: error })
      }

    // Direct transfer for small exports
    try {
      const josmUrl = `${getJosmUrl()}/load_data`
      const params = new URLSearchParams({
        data: osmXml,
        layer_name: layerName,
        new_layer: 'true',
        upload_policy: 'never'
      })

      const response = await fetch(`${josmUrl}?${params.toString()}`, {
        method: 'GET'
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`JOSM returned status ${response.status}: ${errorText}`)
      }

      return {
        featureCount: features.length,
        fileUrl: null,
        method: 'direct',
        success: true
      }
    } catch (error) {
      console.error('Failed to send data to JOSM:', error)
      throw error
    }
  }

  /**
   * Open bounding box area in JOSM
   */
  const openAreaInJosm = async (bbox: [number, number, number, number]) => {
    const isConnected = await testJosmConnection()
    if (!isConnected) throw new Error('JOSM is not running')

    const [minLon, minLat, maxLon, maxLat] = bbox
    const josmUrl = `${getJosmUrl()}/load_and_zoom`
    const params = new URLSearchParams({
      bottom: minLat.toString(),
      left: minLon.toString(),
      right: maxLon.toString(),
      top: maxLat.toString()
    })

    const response = await fetch(`${josmUrl}?${params.toString()}`, {
      method: 'GET'
    })

    if (!response.ok) throw new Error(`JOSM returned status ${response.status}`)
  }

  /**
   * Get JOSM setup instructions
   */
  const getJosmInstructions = (): string[] => [
    '1. Download and install JOSM from https://josm.openstreetmap.de/',
    '2. Start JOSM application',
    '3. Go to Edit → Preferences (or press F12)',
    '4. Navigate to "Remote Control" in the left panel',
    '5. Check "Enable remote control"',
    '6. Optionally check "Load data from API" for automatic data loading',
    '7. Click OK to save settings',
    '8. JOSM is now ready to receive data from this application'
  ]

  return {
    exportLayerToJosm,
    getJosmInstructions,
    josmBaseUrl,
    openAreaInJosm,
    testJosmConnection,
    useSSL
  }
}
