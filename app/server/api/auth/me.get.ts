export default defineEventHandler((event) => {
  const userCookie = getCookie(event, 'osm_user')

  if (!userCookie) {
    return { user: null }
  }

  try {
    const user = JSON.parse(userCookie)
    return { user }
  } catch {
    return { user: null }
  }
})