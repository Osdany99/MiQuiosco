<script setup>
const colorMode = useColorMode()
const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

const conexion = useModoConexion()
conexion.cargar()

const update = useAppUpdate()

// El diálogo debe seguir abierto mientras la entrega interna avanza: si solo
// mirara 'opcional', se cerraría en cuanto entregar() pasara a 'descargando'
// y el usuario vería desaparecer el aviso a mitad de la descarga.
const ESTADOS_ENTREGA = ['descargando', 'instalando', 'espera-permiso']
const ESTADOS_DIALOGO = ['opcional', ...ESTADOS_ENTREGA]

// Mientras la descarga o el instalador están en marcha no se puede cerrar ni
// relanzar la entrega: el diálogo sale bloqueado y la barra va en
// ActualizacionProgreso.
const entregaEnCurso = computed(() => ['descargando', 'instalando'].includes(update.estado.value))

// 'descargando', 'instalando' y 'espera-permiso' sustituyen a 'obligatoria'
// mientras la entrega avanza, pero en un flujo obligatorio la app debe seguir
// bloqueada en todo momento.
const bloqueoObligatorio = computed(() => {
  const e = update.estado.value
  if (e === 'obligatoria') return true
  return update.flujoObligatorio.value && ESTADOS_ENTREGA.includes(e)
})

const mostrarOpcional = computed({
  get() {
    return ESTADOS_DIALOGO.includes(update.estado.value)
  },
  set(v) {
    // Cerrar con la X equivale a "Más tarde", pero no mientras hay una entrega
    // en curso: cerrar ahí dejaría la descarga sin contexto visible.
    if (!v && !ESTADOS_ENTREGA.includes(update.estado.value)) {
      update.posponer()
    }
  }
})

function confirmarOpcional() {
  // Estando en espera de permiso, el botón principal lleva a Ajustes.
  if (update.estado.value === 'espera-permiso') {
    update.abrirAjustes()
    return
  }
  update.entregar()
}

onMounted(async () => {
  const { App } = await import('@capacitor/app')
  await update.cargarMetodo().catch(() => {})
  await update.limpiarDescargaPrevia().catch(() => {})
  await update.comprobar().catch(() => {})

  // Al volver a la app tras el instalador del sistema hay que reconsultar el
  // manifiesto: la versionCode solo cambia si el usuario aceptó la instalación.
  App.addListener('appStateChange', ({ isActive }) => {
    if (isActive && update.estado.value === 'instalando') {
      update.refrescar().catch(() => {})
    }
  }).catch(() => {})
})

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1' },
    { key: 'theme-color', name: 'theme-color', content: color }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'es'
  }
})

const title = 'MiQuiosco'
const description = 'Cuadre diario de tienda o quiosco, offline.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>

<template>
  <UApp>
    <NuxtLoadingIndicator />

    <NuxtLayout>
      <NuxtErrorBoundary>
        <NuxtPage />
        <template #error="{ error }">
          <div class="flex flex-col items-center justify-center min-h-screen p-4">
            <h2 class="text-xl font-bold text-red-600 mb-2">
              Algo salió mal
            </h2>
            <p class="text-gray-600 mb-4">
              {{ error?.message }}
            </p>
            <UButton @click="clearError">
              Volver
            </UButton>
          </div>
        </template>
      </NuxtErrorBoundary>
    </NuxtLayout>

    <!-- Descarga en curso / permiso de instalación: una sola instancia para
         el flujo opcional y el obligatorio, así no se duplica la barra. -->
    <ActualizacionProgreso />

    <!-- Actualización opcional: descartable -->
    <BaseDialog
      v-model="mostrarOpcional"
      :loading="entregaEnCurso"
      title="Actualización disponible"
      :description="`Versión ${update.info.value?.latestVersionName ?? ''} lista para instalar`"
      cancel-text="Más tarde"
      :confirm-text="update.estado.value === 'espera-permiso' ? 'Abrir ajustes' : 'Actualizar'"
      @cancel="update.posponer()"
      @confirm="confirmarOpcional()"
    >
      <p class="text-sm text-muted whitespace-pre-line">
        {{ update.info.value?.changelog || 'Mejoras y correcciones. Se recomienda actualizar.' }}
      </p>
    </BaseDialog>

    <!-- Actualización obligatoria: bloquea la app hasta actualizar.
         Solo aparece con red (sin red se sigue en local, por diseño).
         'espera-permiso' también bloquea: falta el permiso especial y sin él
         no hay forma de instalar. -->
    <div
      v-if="bloqueoObligatorio"
      class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4"
    >
      <UCard class="w-full max-w-sm">
        <div class="space-y-4 text-center">
          <UIcon name="i-lucide-arrow-up-circle" class="size-12 text-primary mx-auto" />
          <div>
            <h2 class="text-lg font-semibold">
              Actualización obligatoria
            </h2>
            <p class="text-sm text-muted mt-1">
              Versión {{ update.info.value?.latestVersionName ?? '' }} requerida para continuar
            </p>
          </div>
          <p class="text-sm text-muted whitespace-pre-line">
            {{ update.info.value?.changelog || 'Esta versión incluye cambios importantes.' }}
          </p>
          <template v-if="update.estado.value === 'espera-permiso'">
            <p class="text-sm text-muted">
              Android necesita tu permiso para instalar la actualización.
            </p>
            <div class="space-y-2">
              <UButton block size="lg" @click="update.abrirAjustes()">
                Abrir ajustes
              </UButton>
              <UButton
                block
                size="sm"
                color="neutral"
                variant="ghost"
                @click="update.usarNavegador()"
              >
                Descargar con el navegador
              </UButton>
            </div>
          </template>
          <UButton
            v-else
            block
            size="lg"
            :loading="entregaEnCurso"
            @click="update.entregar()"
          >
            Actualizar ahora
          </UButton>
        </div>
      </UCard>
    </div>
  </UApp>
</template>
