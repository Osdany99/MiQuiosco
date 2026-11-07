<script setup>
/**
 * Simulador de voz (solo desarrollo).
 *
 * Inyecta un transcript en el pipeline sin micrófono: permite probar gramática,
 * ubicación, candidatos y errores en cualquier navegador y sin el dispositivo.
 * En producción el componente no se renderiza.
 */
const emit = defineEmits(['simular'])
const texto = ref('')
const esDev = import.meta.dev

function enviar() {
  const valor = texto.value.trim()
  if (!valor) return
  emit('simular', valor)
  texto.value = ''
}
</script>

<template>
  <div v-if="esDev" class="flex items-center gap-2">
    <UInput
      v-model="texto"
      size="sm"
      placeholder="Simular voz (dev)"
      class="w-56"
      @keyup.enter="enviar"
    />
    <UButton
      size="sm"
      variant="ghost"
      color="neutral"
      icon="i-lucide-terminal"
      aria-label="Simular comando de voz"
      @click="enviar"
    />
  </div>
</template>
