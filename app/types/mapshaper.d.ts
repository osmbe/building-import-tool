declare module "mapshaper" {
  export const internal: {
    importGeoJSON: (geojson: any, opts: any) => any;
    exportFileContent: (dataset: any, opts: any) => { content: string }[];
  };

  export function simplify(dataset: any, opts: any): any;
}
