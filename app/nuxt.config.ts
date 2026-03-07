import tailwindcss from "@tailwindcss/vite";
export default defineNuxtConfig({
  compatibilityDate: '2025-09-09',
  ssr: false,
  typescript: { strict: false, typeCheck: false },
  modules: [],
  devServer: {
    host: '0.0.0.0', // Listen on all network interfaces (allows both localhost and 127.0.0.1)
    port: 3000
  },
  app: {
    head: {
      title: 'OSMBE - Building Mapping Tool',
      htmlAttrs: { class: 'dark' },
      link: [
        { rel: 'icon', href: 'data:,' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap'
        }
      ],
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  alias: {
    '@': '.',
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
  },
  runtimeConfig: {
    // Private keys (only available server-side)
    jwtSecret: process.env.JWT_SECRET,
    osmClientSecret: process.env.OSM_CLIENT_SECRET,
    dbHost: process.env.POSTGRES_HOST,
    dbPort: process.env.POSTGRES_PORT,
    dbUser: process.env.POSTGRES_USER,
    dbPassword: process.env.POSTGRES_PASSWORD,

    // Public keys (exposed to client)
    public: {
      osmClientId: process.env.OSM_CLIENT_ID,
      osmRedirectUri: process.env.OSM_REDIRECT_URI || 'http://127.0.0.1:3000/api/auth/osm-callback'
    }
  }
})
