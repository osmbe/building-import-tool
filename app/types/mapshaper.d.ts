declare module 'mapshaper' {
  export const internal: {
    importGeoJSON: (geojson: any, opts: any) => any
    exportFileContent: (dataset: any, opts: any) => Array<{ content: string }>
  }

  export function simplify(dataset: any, opts: any): any
}
