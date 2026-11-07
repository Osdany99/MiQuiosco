<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  disponible: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  estado: { type: String, default: 'idle' },
  motivo: { type: String, default: null },
  transcript: { type: String, default: '' },
  confidence: { type: Number, default: 0 }
})

const emit = defineEmits(['activar', 'simular'])

const etiquetaTooltip = computed(() => {
  if (props.ocupado) return 'Escuchando…'
  if (props.estado === 'interpretando') return 'Interpretando…'
  if (props.estado === 'ambiguo') return 'Elegir producto'
  if (props.estado === 'listo') return 'Listo para confirmar'
  if (!props.disponible && props.motivo) return `Voz no disponible: ${props.motivo}`
  return 'Iniciar dictado por voz'
})
</script>

<template>
  <Transition name="slide">
    <div
      v-if="visible"
      class="fixed z-[60] flex flex-col items-end gap-2"
      :style="{
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        right: 'calc(2rem + env(safe-area-inset-right))'
      }"
    >
      <UButton
        icon="i-lucide-mic"
        color="primary"
        variant="soft"
        size="sm"
        class="h-11 w-11 rounded-xl p-0 justify-center shadow-lg backdrop-blur"
        :loading="ocupado"
        :disabled="!disponible || ocupado"
        :aria-label="etiquetaTooltip"
        :title="etiquetaTooltip"
        @click="emit('activar')"
      />
    </div>
  </Transition>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}
.slide-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
