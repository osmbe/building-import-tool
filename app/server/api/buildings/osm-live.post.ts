import { fetchOverpassBuildings, OverpassError } from '~/server/utils/overpass'

// Issue #9: live OSM building footprints (from Overpass) for the current view, so the map can
// show the same fresh data the difference computation uses.
export default defineEventHandler(async (event) => {
  const { bounds } = await readBody(event)

  if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some((b) => typeof b !== 'number')) {
    return sendError(
      event,
      createError({ statusCode: 400, statusMessage: 'Invalid bounds. Expected [minX, minY, maxX, maxY]' })
    )
  }

  try {
    const data = await fetchOverpassBuildings(bounds as [number, number, number, number])
    return { type: 'FeatureCollection', features: data.features, stats: { totalOsm: data.totalOsm } }
  } catch (error) {
    return sendError(
      event,
      createError({
        statusCode: error instanceof OverpassError ? error.statusCode : 500,
        statusMessage: error instanceof Error ? error.message : 'Live OSM request failed'
      })
    )
  }
})
