<script setup>
const update = useAppUpdate()

// En un flujo obligatorio el overlay de app.vue (z-9999, a pantalla completa)
// ya muestra el estado y los botones propios, así que esta tarjeta se oculta
// para no duplicar la UI ni quedar tapada detrás del overlay.
const visible = computed(() =>
  !update.flujoObligatorio.value
  && ['descargando', 'instalando', 'espera-permiso'].includes(update.estado.value)
)

const titulo = computed(() => {
  if (update.estado.value === 'instalando') return 'Abriendo el instalador…'
  if (update.estado.value === 'espera-permiso') return 'Falta un permiso'
  return 'Descargando actualización'
})

const pct = computed(() => update.progreso.value.pct || 0)

const mb = computed(() => (update.progreso.value.contentLength / (1024 * 1024)).toFixed(1))

function formatearBytes(bytes) {
  if (!bytes) return ''
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div
    v-if="visible"
    class="fixed inset-x-0 bottom-0 z-[9998] flex justify-center p-4 pointer-events-none"
  >
    <UCard class="w-full max-w-sm pointer-events-auto">
      <div class="space-y-3">
        <div class="flex items-center gap-2">
          <UIcon
            :name="update.estado.value === 'espera-permiso' ? 'i-lucide-shield-alert' : 'i-lucide-download'"
            class="size-5 shrink-0 text-primary"
          />
          <h3 class="text-sm font-medium">
            {{ titulo }}
          </h3>
        </div>

        <template v-if="update.estado.value === 'espera-permiso'">
          <p class="text-sm text-muted">
            Android necesita tu permiso para instalar la actualización. Concédelo una vez
            y las siguientes actualizaciones se instalarán sin salir de la app.
          </p>
          <div class="flex flex-wrap gap-2">
            <UButton size="sm" @click="update.abrirAjustes()">
              Abrir ajustes
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              @click="update.reintentar()"
            >
              Ya lo concedí, reintentar
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="ghost"
              @click="update.usarNavegador()"
            >
              Usar el navegador
            </UButton>
          </div>
        </template>

        <template v-else-if="update.estado.value === 'instalando'">
          <p class="text-sm text-muted">
            Ya está descargada. Pulsa Instalar en la pantalla del sistema.
          </p>
          <UProgress :value="100" />
        </template>

        <template v-else>
          <UProgress :value="pct" />
          <p class="text-xs text-muted tabular-nums">
            {{ pct }}%<template v-if="update.progreso.value.contentLength">
              · {{ formatearBytes(update.progreso.value.bytes) }} de {{ mb }} MB
            </template>
          </p>
        </template>
      </div>
    </UCard>
  </div>
</template>
