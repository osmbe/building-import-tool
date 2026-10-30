export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const query = getQuery(event);

  const code = query.code as string;
  const state = query.state as string;
  const storedState = getCookie(event, "oauth_state");

  // Verify state to prevent CSRF attacks
  if (!state || state !== storedState) {
    console.error("State mismatch - CSRF protection failed");
    throw createError({
      message: "Invalid state parameter - please try signing in again",
      statusCode: 400,
    });
  }

  // Clear the state cookie
  deleteCookie(event, "oauth_state");

  if (!code)
    throw createError({
      message: "No authorization code received",
      statusCode: 400,
    });

  try {
    // Exchange authorization code for access token
    const tokenUrl = "https://www.openstreetmap.org/oauth2/token";
    const tokenResponse = await $fetch(tokenUrl, {
      body: new URLSearchParams({
        client_id: config.public.osmClientId,
        client_secret: config.osmClientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: config.public.osmRedirectUri,
      }).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });

    const { access_token } = tokenResponse as { access_token: string };

    // Fetch user details from OSM API
    const userResponse = await $fetch(
      "https://api.openstreetmap.org/api/0.6/user/details.json",
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    const userData = userResponse as any;
    const osmUser = userData.user;

    // Create user object
    const user = {
      avatar: osmUser.img?.href || null,
      changesets: osmUser.changesets?.count || 0,
      displayName: osmUser.display_name,
      id: osmUser.id,
      joinDate: osmUser.account_created,
      username: osmUser.display_name,
    };

    // Store access token in secure HTTP-only cookie
    setCookie(event, "osm_token", access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Store user data in cookie (not sensitive, can be accessed by client)
    setCookie(event, "osm_user", JSON.stringify(user), {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // Redirect back to the app
    return sendRedirect(event, "/?auth=success");
  } catch (error) {
    console.error("OSM OAuth error:", error);
    throw createError({
      message: "Authentication failed",
      statusCode: 500,
    });
  }
});
