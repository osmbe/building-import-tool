export default defineEventHandler(async (event) => {
  // Delete the cookies
  deleteCookie(event, 'osm_token')
  deleteCookie(event, 'osm_user')

  return { success: true }
})
