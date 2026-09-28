<script setup>
definePageMeta({
  layout: 'auth'
})

const { data: manifiesto, pending, error, refresh } = await useFetch('/api/app-version')

const nombreVersion = computed(() => manifiesto.value?.latestVersionName ?? '')
const codigoVersion = computed(() => manifiesto.value?.latestVersionCode ?? null)
const changelog = computed(() => manifiesto.value?.changelog || 'Mejoras y correcciones.')

const urlDescarga = computed(() => {
  const apkUrl = manifiesto.value?.apkUrl
  if (!apkUrl) return ''
  if (/^https?:\/\//i.test(apkUrl)) return apkUrl
  if (import.meta.client) {
    return `${window.location.origin}/${String(apkUrl).replace(/^\/+/, '')}`
  }
  return String(apkUrl).startsWith('/') ? apkUrl : `/${apkUrl}`
})
</script>

<template>
  <div class="w-full max-w-md">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-store" class="size-8 text-primary" />
          <div>
            <h1 class="text-xl font-semibold">
              MiQuiosco para Android
            </h1>
            <p class="text-sm text-muted">
              Descarga la aplicación
            </p>
          </div>
        </div>
      </template>

      <div v-if="pending" class="flex items-center justify-center py-8">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-muted" />
      </div>

      <div v-else-if="error || !manifiesto" class="space-y-4">
        <UAlert
          color="error"
          icon="i-lucide-alert-circle"
          title="No se pudo obtener la versión disponible. Revisa tu conexión e inténtalo de nuevo."
        />
        <UButton
          block
          color="neutral"
          variant="outline"
          @click="refresh()"
        >
          Reintentar
        </UButton>
      </div>

      <div v-else class="space-y-4">
        <p class="text-sm text-muted">
          Versión {{ nombreVersion }}<span v-if="codigoVersion != null"> (código {{ codigoVersion }})</span>
        </p>
        <p class="text-sm whitespace-pre-line">
          {{ changelog }}
        </p>

        <UButton
          :to="urlDescarga"
          target="_blank"
          download
          block
          size="lg"
          icon="i-lucide-download"
        >
          Descargar APK
        </UButton>

        <p class="text-xs text-muted">
          En el teléfono, permite la instalación desde el navegador cuando Android lo pida.
          ¿Ya tienes cuenta? <NuxtLink to="/login" class="text-primary hover:underline">Inicia sesión</NuxtLink>.
        </p>
      </div>
    </UCard>
  </div>
</template>
