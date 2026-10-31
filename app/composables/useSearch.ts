export interface SearchResult {
  id: string
  displayName: string
  type: 'city' | 'address' | 'building' | 'poi'
  coordinates: [number, number] // [lng, lat]
  boundingBox?: [number, number, number, number] // [minLng, minLat, maxLng, maxLat]
  details?: {
    country?: string
    region?: string
    postcode?: string
    category?: string
  }
}

interface NominatimResult {
  place_id: number
  licence: string
  osm_type: string
  osm_id: number
  lat: string
  lon: string
  display_name: string
  address: {
    [key: string]: string | undefined
    country?: string
    country_code?: string
    postcode?: string
    state?: string
    region?: string
    city?: string
    town?: string
    village?: string
  }
  boundingbox: [string, string, string, string] // [minLat, maxLat, minLon, maxLon]
  type: string
  class: string
  importance: number
}

/**
 * Determine result type based on OSM type and class
 */
function determineResultType(osmType: string, osmClass: string): SearchResult['type'] {
  // Buildings
  if (osmClass === 'building') return 'building'

  // Addresses
  if (osmClass === 'place' && ['house', 'house_number'].includes(osmType)) return 'address'
  if (osmClass === 'highway' && osmType === 'residential') return 'address'

  // Cities/Towns/Villages
  if (osmClass === 'place' && ['city', 'town', 'village', 'municipality'].includes(osmType)) return 'city'
  if (osmClass === 'boundary' && osmType === 'administrative') return 'city'

  // Everything else is a POI (point of interest)
  return 'poi'
}

/**
 * Search locations using Nominatim API
 */
export async function searchLocations(query: string): Promise<SearchResult[]> {
  if (!query || query.trim().length < 3) return []

  try {
    const params = new URLSearchParams({
      'accept-language': 'en',
      addressdetails: '1',
      countrycodes: 'be', // Limit to Belgium
      format: 'json',
      limit: '10',
      q: query.trim()
    })

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: {
        'User-Agent': 'be2osm-core/1.0' // Required by Nominatim usage policy
      }
    })

    if (!response.ok) throw new Error(`Nominatim API error: ${response.status}`)

    const data: NominatimResult[] = await response.json()

    // Transform Nominatim results to SearchResult format
    return data.map((result) => {
      const coordinates: [number, number] = [parseFloat(result.lon), parseFloat(result.lat)]

      // Parse bounding box [minLat, maxLat, minLon, maxLon] -> [minLng, minLat, maxLng, maxLat]
      const boundingBox: [number, number, number, number] = [
        parseFloat(result.boundingbox[2]), // MinLon
        parseFloat(result.boundingbox[0]), // MinLat
        parseFloat(result.boundingbox[3]), // MaxLon
        parseFloat(result.boundingbox[1]) // MaxLat
      ]

      return {
        boundingBox,
        coordinates,
        details: {
          category: result.class,
          country: result.address.country,
          postcode: result.address.postcode,
          region: result.address.state || result.address.region
        },
        displayName: result.display_name,
        id: `osm-${result.place_id}`,
        type: determineResultType(result.type, result.class)
      }
    })
  } catch (error) {
    console.error('Error searching locations:', error)
    throw error
  }
}

export function getSearchHistory(): SearchResult[] {
  try {
    const raw = localStorage.getItem('search_history') || '[]'
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function addToSearchHistory(item: SearchResult) {
  const hist = getSearchHistory()
  const exists = hist.find((h) => h.id === item.id)
  const next = exists ? hist : [item, ...hist].slice(0, 10)
  localStorage.setItem('search_history', JSON.stringify(next))
  return next
}
