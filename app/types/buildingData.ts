// The building shown in the object info panel (components/ObjectInfoPanel.vue).
export interface BuildingData {
  id: string;
  type: "candidate" | "osm" | "conflict";
  coordinates: [number, number];
  properties: {
    levels?: number;
    height?: number;
    buildingType?: string;
    sourceDate?: string;
    source: string;
    address?: string;
    postcode?: string;
    buildingMaterial?: string;
    roofType?: string;
    constructionYear?: number;
    lastModified?: string;
    contributor?: string;
    qaIssues?: {
      id: string;
      type: string;
      severity: "low" | "medium" | "high";
      message: string;
    }[];
  };
  osmData?: {
    levels?: number;
    height?: number;
    buildingType?: string;
    source?: string;
    lastModified?: string;
    contributor?: string;
    tags?: Record<string, string>;
  };
  authoritativeData?: {
    levels?: number;
    height?: number;
    buildingType?: string;
    buildingMaterial?: string;
    roofType?: string;
    constructionYear?: number;
    sourceDate?: string;
  };
}
