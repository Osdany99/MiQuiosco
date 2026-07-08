// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  // SPA mode: requerido para empaquetar como app estática en Capacitor.
  // El WebView de Android apunta a la build estática del cliente; las llamadas
  // a la API van al servidor Nitro remoto (la laptop) o a SQLite local.
  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  future: {
    compatibilityVersion: 4 // esto activa la estructura app/
  },

  // Compatibilidad con Vue y TypeScript
  compatibilityDate: '2025-06-09',

  typescript: {
    strict: true
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },
  icon: {
    provider: 'none',
    clientBundle: {
      scan: true,
      icons: [
        'lucide:minus',
        'lucide:plus',
        'lucide:chevrons-left',
        'lucide:chevron-left',
        'lucide:chevrons-right',
        'lucide:chevron-right',
        'lucide:arrow-up-down',
        'lucide:database',
        'lucide:alert-circle',
        'lucide:upload',
        'lucide:loader-2'
      ]
    },
    fallbackToApi: false
  }
})
