<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const api = useAdminApi()

const datos = ref(null)
const cargando = ref(false)
const error = ref(null)

async function cargar() {
  cargando.value = true
  error.value = null
  try {
    datos.value = await api.resumen()
  } catch (err) {
    error.value = err.message
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const tarjetas = computed(() => {
  const puestos = datos.value?.puestos ?? { total: 0, activos: 0, centrales: 0 }
  const dispositivos = datos.value?.dispositivos ?? { total: 0, revocados: 0, activos24h: 0, ultimaSyncOkEn: null }
  const fallos = datos.value?.fallos ?? { total: 0, abiertos: 0, resueltos7d: 0 }

  return [
    {
      titulo: 'Puestos',
      valor: puestos.total,
      detalle: `${puestos.activos} activos · ${puestos.centrales} central`,
      icono: 'i-lucide-store',
      enlace: '/admin/puestos',
      accion: 'Ver puestos'
    },
    {
      titulo: 'Dispositivos',
      valor: dispositivos.total,
      detalle: `${dispositivos.activos24h} conectados en 24 h · ${dispositivos.revocados} revocados`,
      icono: 'i-lucide-smartphone',
      enlace: '/admin/dispositivos',
      accion: 'Ver dispositivos'
    },
    {
      titulo: 'Fallos abiertos',
      valor: fallos.abiertos,
      detalle: `${fallos.resueltos7d} resueltos en los últimos 7 días`,
      icono: 'i-lucide-triangle-alert',
      enlace: '/admin/fallos',
      accion: 'Revisar fallos',
      alerta: fallos.abiertos > 0
    },
    {
      titulo: 'Última sync correcta',
      valor: fmtFechaHora(dispositivos.ultimaSyncOkEn),
      detalle: 'En cualquier dispositivo de la plataforma',
      icono: 'i-lucide-cloud-check',
      fecha: true
    }
  ]
})
</script>

<template>
  <BaseHeaderPage
    title="Resumen"
    description="Estado general de la plataforma"
    leading-icon="i-lucide-layout-dashboard"
    :show-button="false"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Actualizar"
        :loading="cargando"
        @click="cargar"
      />
    </template>

    <UAlert
      v-if="error"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="error"
    />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard v-for="tarjeta in tarjetas" :key="tarjeta.titulo">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm text-muted">
              {{ tarjeta.titulo }}
            </p>
            <p
              class="mt-2 font-bold"
              :class="[tarjeta.fecha ? 'text-lg' : 'text-3xl', tarjeta.alerta ? 'text-error' : '']"
            >
              {{ tarjeta.valor }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ tarjeta.detalle }}
            </p>
          </div>
          <UIcon :name="tarjeta.icono" class="size-6 shrink-0 text-muted" />
        </div>

        <template v-if="tarjeta.enlace" #footer>
          <UButton
            :to="tarjeta.enlace"
            :label="tarjeta.accion"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </template>
      </UCard>
    </div>

    <UCard>
      <template #header>
        <h2 class="font-semibold">
          Cómo funciona el panel
        </h2>
      </template>
      <ul class="space-y-2 text-sm text-muted">
        <li class="flex gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span><strong class="text-default">Puestos:</strong> crea el local y su usuario jefe. No hay registro público.</span>
        </li>
        <li class="flex gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span><strong class="text-default">Dispositivos:</strong> cada APK aparece al iniciar sesión. Puedes renombrarlo o revocarlo.</span>
        </li>
        <li class="flex gap-2">
          <UIcon name="i-lucide-check" class="mt-0.5 size-4 shrink-0 text-primary" />
          <span><strong class="text-default">Fallos:</strong> los errores de sincronización llegan desde el buzón de cada equipo y se agrupan por puesto.</span>
        </li>
      </ul>
    </UCard>
  </BaseHeaderPage>
</template>
