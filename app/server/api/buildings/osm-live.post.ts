import { OverpassError, fetchOverpassBuildings } from '~/server/utils/overpass'

// Issue #9: live OSM building footprints (from Overpass) for the current view, so the map can
// Show the same fresh data the difference computation uses.
export default defineEventHandler(async (event) => {
  const { bounds } = await readBody(event)

  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((b) => typeof b !== 'number')) {
    sendError(
      event,
      createError({ statusCode: 400, statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]' })
    )
    return
  }

  try {
    const data = await fetchOverpassBuildings(bounds as [number, number, number, number])
    return { features: data.features, stats: { totalOsm: data.totalOsm }, type: 'FeatureCollection' }
  } catch (error) {
    sendError(
      event,
      createError({
        statusCode: error instanceof OverpassError ? error.statusCode : 500,
        statusMessage: error instanceof Error ? error.message : 'Live OSM request failed'
      })
    )
    return
  }
})
