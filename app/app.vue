<script setup>
const colorMode = useColorMode()
const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

const conexion = useModoConexion()
conexion.cargar()

const update = useAppUpdate()
const mostrarOpcional = computed({
  get() {
    return update.estado.value === 'opcional'
  },
  set(v) {
    // Cerrar con la X equivale a "Más tarde".
    if (!v) update.posponer()
  }
})

onMounted(() => {
  update.cargarMetodo().catch(() => {}).finally(() => {
    update.comprobar().catch(() => {})
  })
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

    <!-- Actualización opcional: descartable -->
    <BaseDialog
      v-model="mostrarOpcional"
      title="Actualización disponible"
      :description="`Versión ${update.info.value?.latestVersionName ?? ''} lista para instalar`"
      cancel-text="Más tarde"
      confirm-text="Actualizar"
      @cancel="update.posponer()"
      @confirm="update.entregar()"
    >
      <p class="text-sm text-muted whitespace-pre-line">
        {{ update.info.value?.changelog || 'Mejoras y correcciones. Se recomienda actualizar.' }}
      </p>
    </BaseDialog>

    <!-- Actualización obligatoria: bloquea la app hasta actualizar.
         Solo aparece con red (sin red se sigue en local, por diseño). -->
    <div
      v-if="update.estado.value === 'obligatoria'"
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
          <UButton block size="lg" @click="update.entregar()">
            Actualizar ahora
          </UButton>
        </div>
      </UCard>
    </div>
  </UApp>
</template>
