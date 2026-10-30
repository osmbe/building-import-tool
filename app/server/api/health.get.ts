export default defineEventHandler((event) => {
  // Basic health check - returns 200 OK if server is running
  // Add more sophisticated checks if needed (DB connection, etc.)

  try {
    // Optional: Check database connection
    // Const db = useDatabase()
    // Await db.sql`SELECT 1`

    return {
      service: "be2osm-nuxt",
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  } catch (error) {
    setResponseStatus(event, 503);
    return {
      error: error instanceof Error ? error.message : "Unknown error",
      status: "unhealthy",
      timestamp: new Date().toISOString(),
    };
  }
});
