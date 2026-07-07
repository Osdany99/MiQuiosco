<script setup>
const auth = useAuth()

const destino = computed(() => {
  if (auth.esJefe.value) return '/cuadre'
  if (auth.esTrabajador.value) return '/cuadre'
  return '/login'
})

await navigateTo(destino.value, { replace: true })
</script>

<template>
  <div class="flex items-center justify-center p-8">
    <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
  </div>
</template>
