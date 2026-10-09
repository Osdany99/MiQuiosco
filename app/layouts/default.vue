<script setup>
import { Capacitor } from '@capacitor/core'

const auth = useAuth()
const isCollapsed = ref(true)
const mobileOpen = ref(false)

const { hayRed, cargarEstado, faseSync, progresoSync } = useSync()
const conexion = useModoConexion()
const config = useRuntimeConfig()

const etiquetaSync = computed(() => etiquetaFaseSync(faseSync.value, progresoSync.value))
const mostrarBannerSync = computed(() => conexion.transicionando.value || faseSync.value !== 'inactiva')

// El cambio Online/Local solo existe en Android nativo: en web el modo es
// forzosamente online y el sqlite es in-memory (se pierde al recargar).
const esNativo = computed(() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})

const inactTimeout = Number(config.public.sessionInactivityTimeoutJefeSegundos) || 60
const ACTIVITY_THROTTLE_MS = Math.max(5000, (inactTimeout * 1000) / 2)
let ultimoRegistroActividad = 0
function onUserActivity() {
  const ahora = Date.now()
  if (ahora - ultimoRegistroActividad > ACTIVITY_THROTTLE_MS) {
    ultimoRegistroActividad = ahora
    auth.registrarActividad()
  }
}

onMounted(() => {
  cargarEstado()
  conexion.cargar().catch(() => {})
  document.addEventListener('click', onUserActivity)
  document.addEventListener('keydown', onUserActivity)
  document.addEventListener('touchstart', onUserActivity)
})

onUnmounted(() => {
  document.removeEventListener('click', onUserActivity)
  document.removeEventListener('keydown', onUserActivity)
  document.removeEventListener('touchstart', onUserActivity)
})

const colorMode = useColorMode()
const isDark = computed({
  get() {
    return colorMode.value === 'dark'
  },
  set(val) {
    colorMode.preference = val ? 'dark' : 'light'
  }
})

const links = computed(() => {
  const items = []

  if (auth.esJefe.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre'
      },
      {
        label: 'Historial',
        icon: 'i-lucide-clock',
        to: '/cuadres'
      },
      {
        label: 'Deudas',
        icon: 'i-lucide-hand-coins',
        to: '/deudas'
      },
      {
        label: 'Productos',
        icon: 'i-lucide-package',
        to: '/productos'
      },
      // Los proveedores se administran aparte; el enlace del menú se oculta con
      // la bandera (la página /proveedores sigue viva por URL directa).
      ...(MOSTRAR_PROVEEDOR
        ? [{
            label: 'Proveedores',
            icon: 'i-lucide-truck',
            to: '/proveedores'
          }]
        : []),
      {
        label: 'Quiosco',
        icon: 'i-lucide-store',
        to: '/quiosco'
      },
      {
        label: 'Almacén',
        icon: 'i-lucide-warehouse',
        to: '/almacen'
      },
      {
        label: 'Usuarios',
        icon: 'i-lucide-user-cog',
        to: '/usuarios'
      },
      {
        label: 'Clientes',
        icon: 'i-lucide-users',
        to: '/clientes'
      },
      {
        label: 'Ficha cliente',
        icon: 'i-lucide-user-search',
        to: '/ficha-cliente'
      },
      {
        label: 'Gráficas',
        icon: 'i-lucide-bar-chart-2',
        to: '/graficas'
      },
      {
        label: 'Recargas',
        icon: 'i-lucide-smartphone-charging',
        to: '/recargas'
      },
      {
        label: 'Por confirmar',
        icon: 'i-lucide-message-square-text',
        to: '/recargas/sms'
      }
    )
  } else if (auth.esTrabajador.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre'
      }
    )
  }

  return items
})

const userMenuItems = computed(() => {
  const items = [
    [
      {
        label: auth.usuarioActual.value?.nombre || 'Usuario',
        slot: 'profile',
        disabled: true
      }
    ]
  ]

  if (auth.esJefe.value && esNativo.value) {
    const enTransicion = conexion.transicionando.value
    const modoItems = [
      {
        label: enTransicion && etiquetaSync.value
          ? etiquetaSync.value
          : (conexion.modo.value === 'online' ? 'Modo: Online' : 'Modo: Local'),
        icon: enTransicion ? 'i-lucide-loader-circle' : (conexion.modo.value === 'online' ? 'i-lucide-globe' : 'i-lucide-database'),
        onSelect: () => { if (!enTransicion) conexion.toggle() },
        disabled: enTransicion
      }
    ]
    if (enTransicion) {
      modoItems.push({
        label: 'Cancelar sincronización',
        icon: 'i-lucide-x',
        onSelect: () => { cancelarSincronizacion() }
      })
    }
    items.push(modoItems)
  }

  items.push(
    [
      {
        label: isDark.value ? 'Tema Claro' : 'Tema Oscuro',
        icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
        onSelect: () => { isDark.value = !isDark.value }
      }
    ],
    [
      {
        label: 'Configuración',
        icon: 'i-lucide-settings',
        to: '/settings'
      }
    ],
    [
      {
        label: 'Cerrar sesión',
        icon: 'i-lucide-log-out',
        onSelect: () => { auth.logout() }
      }
    ]
  )

  return items
})
</script>

<template>
  <UDashboardGroup unit="rem" class="w-full min-h-screen flex">
    <UDashboardSidebar
      id="default"
      v-model:open="mobileOpen"
      v-model:collapsed="isCollapsed"
      collapsible
      class="bg-elevated/25 border-r border-gray-200 dark:border-gray-800"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1 select-none cursor-pointer" @click="isCollapsed = !isCollapsed">
          <UIcon name="i-lucide-store" class="size-6 text-primary shrink-0" />
          <span v-if="!collapsed" class="font-semibold truncate">MiQuiosco</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="border-t border-gray-200 dark:border-gray-800 w-full">
          <UDropdownMenu v-if="auth.usuarioActual.value" :items="userMenuItems" :popper="{ placement: collapsed ? 'right-start' : 'top' }">
            <UButton
              color="neutral"
              variant="ghost"
              class="w-full flex items-center gap-2 px-2 py-1.5"
              :class="{ 'justify-center': collapsed }"
            >
              <div class="relative shrink-0">
                <UAvatar
                  :alt="auth.usuarioActual.value?.nombre"
                  size="sm"
                />
                <span
                  v-if="auth.esJefe.value"
                  class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background"
                  :class="hayRed ? 'bg-green-500' : 'bg-red-500'"
                />
              </div>
              <div v-if="!collapsed" class="text-left min-w-0 flex-1">
                <p class="text-sm font-medium truncate">
                  {{ auth.usuarioActual.value?.nombre }}
                </p>
                <p class="text-xs text-muted truncate">
                  {{ auth.rol.value }}
                </p>
              </div>
            </UButton>

            <template #profile="{ item }">
              <div class="text-left px-2 py-1.5">
                <p class="text-xs text-muted">
                  Sesión activa como
                </p>
                <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {{ item.label }}
                </p>
              </div>
            </template>
          </UDropdownMenu>
        </div>
      </template>
    </UDashboardSidebar>

    <div class="flex-1 min-w-0 w-full p-6 overflow-y-auto">
      <UButton
        v-if="isCollapsed"
        icon="i-lucide-menu"
        variant="ghost"
        size="sm"
        class="lg:hidden mb-4"
        @click="mobileOpen = true"
      />
      <slot />
    </div>

    <!-- Progreso visible del cambio Local/Online: el toggle cierra el menú al
         tocarlo, así que el estado vive aquí para que se vea sin reabrir nada. -->
    <div
      v-if="mostrarBannerSync"
      class="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 px-4 py-2 shadow-lg"
    >
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin text-primary shrink-0" />
      <span class="text-sm font-medium whitespace-nowrap">{{ etiquetaSync || 'Sincronizando…' }}</span>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        aria-label="Cancelar sincronización"
        @click="cancelarSincronizacion()"
      />
    </div>
  </UDashboardGroup>
</template>
