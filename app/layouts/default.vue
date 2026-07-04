<script setup>
const auth = useAuth()
const isCollapsed = ref(true)
const mobileOpen = ref(false)

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

  if (auth.esAdmin.value) {
    items.push(
      {
        label: 'Usuarios',
        icon: 'i-lucide-users',
        to: '/usuarios'
      },
      {
        label: 'Productos',
        icon: 'i-lucide-package',
        to: '/productos'
      },
      {
        label: 'Cuadre',
        icon: 'i-lucide-clipboard-list',
        to: '/cuadre'
      },
      {
        label: 'Gráficas',
        icon: 'i-lucide-bar-chart-2',
        to: '/graficas'
      }
    )
  } else if (auth.esJefe.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre'
      },
      {
        label: 'Productos',
        icon: 'i-lucide-package',
        to: '/productos'
      },
      {
        label: 'Gráficas',
        icon: 'i-lucide-bar-chart-2',
        to: '/graficas'
      }
    )
  } else if (auth.esTrabajador.value) {
    items.push(
      {
        label: 'Mi registro',
        icon: 'i-lucide-edit-3',
        to: '/registro-trabajador'
      }
    )
  }

  return items
})

const userMenuItems = computed(() => [
  [
    {
      label: auth.usuarioActual.value?.nombre || 'Usuario',
      slot: 'profile',
      disabled: true
    }
  ],
  [
    {
      label: isDark.value ? 'Tema Claro' : 'Tema Oscuro',
      icon: isDark.value ? 'i-lucide-sun' : 'i-lucide-moon',
      onSelect: () => {
        isDark.value = !isDark.value
      }
    }
  ],
  [
    {
      label: 'Cerrar sesión',
      icon: 'i-lucide-log-out',
      onSelect: () => {
        auth.logout()
      }
    }
  ]
])
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
              <UAvatar
                :alt="auth.usuarioActual.value?.nombre"
                size="sm"
                class="shrink-0"
              />
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

    <!-- Panel de contenido a la derecha -->
    <div class="flex-1 min-w-0 w-full p-6 overflow-y-auto">
      <!-- Botón hamburguesa para móvil, visible solo cuando sidebar está cerrado -->
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
  </UDashboardGroup>
</template>
