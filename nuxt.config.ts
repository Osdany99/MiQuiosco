// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],
  ssr: false,

  devtools: {
    enabled: import.meta.dev
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    public: {
      syncServerUrl: process.env.SYNC_SERVER_URL || '',
      // Sin prefijo NUXT_PUBLIC_ a propósito: Vercel bloquea ese prefijo en
      // su UI (ver docs/PUBLICAR_VERSION.md). Los nombres coinciden con .env.
      sessionExpirationTrabajadorHoras: process.env.SESSION_EXPIRATION_TRABAJADOR_HORAS || '24',
      sessionInactivityTimeoutJefeSegundos: process.env.SESSION_INACTIVITY_TIMEOUT_JEFE_SEGUNDOS || '60'
    }
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },
  sourcemap: false,

  future: {
    compatibilityVersion: 4 // esto activa la estructura app/
  },

  // Compatibilidad con Vue y TypeScript
  compatibilityDate: '2025-06-09',
  nitro: {
    prerender: {
      routes: ['/']
    }
  },

  typescript: {
    strict: true
  },
  telemetry: false,

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
        'lucide:check',
        'lucide:key',
        'lucide:loader-2'
      ]
    },
    fallbackToApi: false
  }
})
