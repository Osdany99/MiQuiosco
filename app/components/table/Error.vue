<template>
  <div
    v-if="error"
    class="flex flex-col items-center justify-center h-32 gap-2 text-red-500"
  >
    <UIcon name="i-lucide-alert-circle" class="w-8 h-8" />
    <p class="text-sm">
      <slot>{{ mensaje }}</slot>
      <button class="underline ml-1" @click="$emit('retry')">
        Reintentar
      </button>
    </p>
  </div>
</template>

<script setup>
defineProps({
  error: { type: [Object, Boolean], default: null },
  mensaje: { type: String, default: 'Error al cargar los datos.' }
})

defineEmits(['retry'])
</script>
