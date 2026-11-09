<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  estado: { type: String, default: 'idle' },
  error: { type: String, default: '' }
})

const emit = defineEmits(['reintentar'])

const titulo = computed(() => {
  if (props.estado === 'preparando') return 'Preparando micrófono…'
  if (props.estado === 'interpretando') return 'Interpretando…'
  if (props.estado === 'ambiguo') return 'Elige un producto'
  if (props.estado === 'listo') return 'Listo para confirmar'
  if (props.estado === 'error') return props.error || 'No te entendí.'
  return 'Escuchando…'
})

const icono = computed(() => {
  if (props.estado === 'error') return 'i-lucide-triangle-alert'
  if (props.estado === 'preparando') return 'i-lucide-loader-circle'
  return 'i-lucide-mic'
})

const esError = computed(() => props.estado === 'error')
</script>

<template>
  <Transition name="fade-top">
    <div
      v-if="visible"
      class="pointer-events-none fixed inset-x-0 top-0 z-[80]"
    >
      <div class="h-1 w-full overflow-hidden bg-gray-200/40 dark:bg-slate-800/40">
        <div
          class="h-full w-1/3 rounded-r-full"
          :class="[esError ? 'bg-error/70' : 'bg-primary/80', !esError && 'voice-listening-bar']"
        />
      </div>
      <div class="flex justify-center pt-2">
        <span
          class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
          :class="esError ? 'pointer-events-auto border-error/40 text-error' : 'pointer-events-none'"
        >
          <UIcon
            :name="icono"
            class="size-3.5"
            :class="esError ? 'text-error' : 'text-primary animate-pulse'"
          />
          <span class="max-w-[60vw] truncate">{{ titulo }}</span>
          <UButton
            v-if="esError"
            size="xs"
            variant="soft"
            color="error"
            label="Reintentar"
            @click.stop="emit('reintentar')"
          />
        </span>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.voice-listening-bar {
  animation: voice-slide 1.1s ease-in-out infinite;
}

@keyframes voice-slide {
  0% {
    transform: translateX(-100%);
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    transform: translateX(300%);
    opacity: 0.6;
  }
}

.fade-top-enter-active,
.fade-top-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.fade-top-enter-from,
.fade-top-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
