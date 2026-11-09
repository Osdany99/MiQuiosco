<script setup>
const { usuario, cerrarSesion, cargarDesdeAlmacen } = useAdminAuth()
const route = useRoute()

const secciones = [
  { label: 'Resumen', to: '/admin', icon: 'i-lucide-layout-dashboard' },
  { label: 'Puestos', to: '/admin/puestos', icon: 'i-lucide-store' },
  { label: 'Dispositivos', to: '/admin/dispositivos', icon: 'i-lucide-smartphone' },
  { label: 'Fallos', to: '/admin/fallos', icon: 'i-lucide-triangle-alert' },
  { label: 'Voz', to: '/admin/voz', icon: 'i-lucide-mic' },
  { label: 'Léxico voz', to: '/admin/voz-lexico', icon: 'i-lucide-book' }
]

function esActiva(destino) {
  if (destino === '/admin') return route.path === '/admin'
  return route.path === destino || route.path.startsWith(`${destino}/`)
}

onMounted(() => cargarDesdeAlmacen())
</script>

<template>
  <div class="min-h-screen bg-elevated/40">
    <header class="sticky top-0 z-30 border-b border-default bg-default/95 backdrop-blur">
      <div class="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 py-2 sm:px-6">
        <NuxtLink to="/admin" class="flex items-center gap-2">
          <UIcon name="i-lucide-shield-check" class="size-6 text-primary" />
          <span class="font-semibold">MiQuiosco</span>
          <UBadge
            color="primary"
            variant="soft"
            size="sm"
            label="Administración"
            class="hidden sm:inline-flex"
          />
        </NuxtLink>

        <nav class="order-3 flex w-full flex-wrap items-center gap-1 sm:order-none sm:ml-6 sm:w-auto">
          <UButton
            v-for="seccion in secciones"
            :key="seccion.to"
            :to="seccion.to"
            :icon="seccion.icon"
            :label="seccion.label"
            size="sm"
            :color="esActiva(seccion.to) ? 'primary' : 'neutral'"
            :variant="esActiva(seccion.to) ? 'soft' : 'ghost'"
          />
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <span class="hidden text-sm text-muted md:inline">
            {{ usuario?.nombre ?? 'Super admin' }}
          </span>
          <UTooltip text="Cerrar sesión" :delay-duration="0">
            <UButton
              icon="i-lucide-log-out"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Cerrar sesión"
              @click="cerrarSesion"
            />
          </UTooltip>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
      <slot />
    </main>
  </div>
</template>
