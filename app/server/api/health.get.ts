export default defineEventHandler(async (event) => {
  // Basic health check - returns 200 OK if server is running
  // Add more sophisticated checks if needed (DB connection, etc.)

  try {
    // Optional: Check database connection
    // const db = useDatabase()
    // await db.sql`SELECT 1`

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'be2osm-nuxt'
    }
  } catch (error) {
    setResponseStatus(event, 503)
    return {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
})
