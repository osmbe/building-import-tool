import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  alias: {
    '@': '.'
  },
  app: {
    head: {
      htmlAttrs: { class: 'dark' },
      link: [
        { href: 'data:,', rel: 'icon' },
        { href: 'https://fonts.googleapis.com', rel: 'preconnect' },
        { crossorigin: '', href: 'https://fonts.gstatic.com', rel: 'preconnect' },
        {
          href: 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
          rel: 'stylesheet'
        }
      ],
      meta: [{ content: 'width=device-width, initial-scale=1', name: 'viewport' }],
      title: 'OSMBE - Building Mapping Tool'
    }
  },
  compatibilityDate: '2025-09-09',
  css: ['~/assets/css/main.css'],
  devServer: {
    host: '0.0.0.0', // Listen on all network interfaces (allows both localhost and 127.0.0.1)
    port: 3000
  },
  modules: [],
  runtimeConfig: {
    // Private keys (only available server-side)
    jwtSecret: process.env.JWT_SECRET,
    osmClientSecret: process.env.OSM_CLIENT_SECRET,
    dbHost: process.env.POSTGRES_HOST,
    dbPort: process.env.POSTGRES_PORT,
    dbUser: process.env.POSTGRES_USER,
    dbPassword: process.env.POSTGRES_PASSWORD,
    // Git commit of the build (Dockerfile GIT_SHA build arg), reported by /api/health/ready
    gitSha: process.env.GIT_SHA ?? 'dev',

    // Public keys (exposed to client)
    public: {
      osmClientId: process.env.OSM_CLIENT_ID,
      osmRedirectUri: process.env.OSM_REDIRECT_URI ?? 'http://127.0.0.1:3000/api/auth/osm-callback'
    }
  },
  ssr: false,
  typescript: { strict: true, typeCheck: false },
  vite: {
    plugins: [tailwindcss()]
  }
})
