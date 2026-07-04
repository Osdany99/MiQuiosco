<script setup>
const auth = useAuth()
const open = ref(false)

const links = computed(() => {
  const items = []

  if (auth.esAdmin.value) {
    items.push(
      {
        label: 'Usuarios',
        icon: 'i-lucide-users',
        to: '/usuarios',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Productos',
        icon: 'i-lucide-package',
        to: '/productos',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Cuadres',
        icon: 'i-lucide-clipboard-list',
        to: '/cuadres',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Gráficas',
        icon: 'i-lucide-bar-chart-2',
        to: '/graficas',
        onSelect: () => { open.value = false }
      }
    )
  } else if (auth.esJefe.value) {
    items.push(
      {
        label: 'Cuadre del día',
        icon: 'i-lucide-clipboard-check',
        to: '/cuadre',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Productos',
        icon: 'i-lucide-package',
        to: '/productos',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Gráficas',
        icon: 'i-lucide-bar-chart-2',
        to: '/graficas',
        onSelect: () => { open.value = false }
      },
      {
        label: 'Sincronizar',
        icon: 'i-lucide-refresh-cw',
        to: '/sincronizar',
        onSelect: () => { open.value = false }
      }
    )
  } else if (auth.esTrabajador.value) {
    items.push(
      {
        label: 'Mi registro',
        icon: 'i-lucide-edit-3',
        to: '/registro-trabajador',
        onSelect: () => { open.value = false }
      }
    )
  }

  return items
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      class="bg-elevated/25"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1">
          <UIcon name="i-lucide-store" class="size-6 text-primary" />
          <span v-if="!collapsed" class="font-semibold">MiQuiosco</span>
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
        <div v-if="!collapsed" class="flex flex-col gap-2 p-2">
          <div class="text-xs text-muted px-2 py-1 border-t">
            {{ auth.usuarioActual?.nombre || '—' }} ({{ auth.rol?.value || '—' }})
          </div>
          <UButton
            v-if="!collapsed"
            block
            variant="ghost"
            color="error"
            icon="i-lucide-log-out"
            :loading="auth.cargando.value"
            size="sm"
            @click="auth.logout()"
          >
            Cerrar sesión
          </UButton>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
