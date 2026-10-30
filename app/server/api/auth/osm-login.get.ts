export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();

  // OSM OAuth 2.0 endpoints
  const authUrl = "https://www.openstreetmap.org/oauth2/authorize";

  // Generate a random state for CSRF protection
  const state = Math.random().toString(36).substring(7);

  // Store state in cookie for verification
  setCookie(event, "oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  // Build the authorization URL
  const params = new URLSearchParams({
    client_id: config.public.osmClientId,
    redirect_uri: config.public.osmRedirectUri,
    response_type: "code",
    scope: "read_prefs",
    state,
  });

  const redirectUrl = `${authUrl}?${params.toString()}`;

  // Redirect to OSM authorization page
  return sendRedirect(event, redirectUrl);
});
