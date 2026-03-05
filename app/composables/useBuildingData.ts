export interface BuildingData {
  id: string
  type: 'candidate' | 'osm' | 'conflict'
  coordinates: [number, number]
  properties: {
    levels?: number
    height?: number
    buildingType?: string
    sourceDate?: string
    source: string
    address?: string
    postcode?: string
    buildingMaterial?: string
    roofType?: string
    constructionYear?: number
    lastModified?: string
    contributor?: string
    qaIssues?: { id: string; type: string; severity: 'low'|'medium'|'high'; message: string }[]
  }
  osmData?: {
    levels?: number
    height?: number
    buildingType?: string
    source?: string
    lastModified?: string
    contributor?: string
  }
  authoritativeData?: {
    levels?: number
    height?: number
    buildingType?: string
    buildingMaterial?: string
    roofType?: string
    constructionYear?: number
    sourceDate?: string
  }
}

export const mockBuildingData: BuildingData[] = [
  {
    id: 'b-1',
    type: 'candidate',
    coordinates: [4.3047, 50.9087],
    properties: {
      levels: 4,
      height: 14.2,
      buildingType: 'residential',
      sourceDate: '2024-10-02T10:00:00Z',
      source: 'authoritative',
      qaIssues: [
        { id: 'q1', type: 'geometry', severity: 'medium', message: 'Polygon has slight self-intersection' }
      ]
    },
    osmData: {
      levels: 3,
      buildingType: 'residential',
      source: 'OSM',
      lastModified: '2023-08-12T14:22:00Z',
      contributor: 'mapper_pro'
    },
    authoritativeData: {
      levels: 3,
      height: 12.5,
      buildingType: 'residential',
      buildingMaterial: 'brick',
      roofType: 'flat',
      constructionYear: 1985
    }
  },
  {
    id: 'b-2',
    type: 'osm',
    coordinates: [4.3067, 50.9067],
    properties: {
      levels: 6,
      sourceDate: '2023-06-01T00:00:00Z',
      source: 'osm'
    }
  },
  {
    id: 'b-3',
    type: 'conflict',
    coordinates: [4.3027, 50.9107],
    properties: {
      levels: 10,
      height: 35,
      buildingType: 'office',
      source: 'authoritative',
      qaIssues: [
        { id: 'q2', type: 'metadata', severity: 'high', message: 'Levels mismatch with OSM' }
      ]
    }
  },
  {
    id: 'b-4',
    type: 'candidate',
    coordinates: [4.3037, 50.9097],
    properties: {
      levels: 2,
      height: 8.5,
      buildingType: 'residential',
      sourceDate: '2024-09-15T09:30:00Z',
      source: 'authoritative'
    }
  },
  {
    id: 'b-5',
    type: 'osm',
    coordinates: [4.3057, 50.9077],
    properties: {
      levels: 3,
      buildingType: 'commercial',
      sourceDate: '2023-07-20T16:45:00Z',
      source: 'osm'
    }
  },
  {
    id: 'b-6',
    type: 'candidate',
    coordinates: [4.3017, 50.9117],
    properties: {
      levels: 1,
      height: 4.2,
      buildingType: 'garage',
      sourceDate: '2024-08-01T11:00:00Z',
      source: 'authoritative'
    }
  }
]
