<script setup>
const colorMode = useColorMode()
const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

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
  </UApp>
</template>
