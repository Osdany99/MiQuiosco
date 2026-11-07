<script setup>
const props = defineProps({
  visible: { type: Boolean, default: false },
  ocupado: { type: Boolean, default: false },
  estado: { type: String, default: 'idle' }
})

const titulo = computed(() => {
  if (props.estado === 'interpretando') return 'Interpretando…'
  if (props.estado === 'ambiguo') return 'Elige un producto'
  if (props.estado === 'listo') return 'Listo para confirmar'
  return 'Escuchando…'
})
</script>

<template>
  <Transition name="fade-top">
    <div
      v-if="visible"
      class="pointer-events-none fixed inset-x-0 top-0 z-[80]"
    >
      <div class="h-1 w-full overflow-hidden bg-gray-200/40 dark:bg-slate-800/40">
        <div class="voice-listening-bar h-full w-1/3 rounded-r-full bg-primary/80" />
      </div>
      <div class="flex justify-center pt-2">
        <span class="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-700 shadow-md backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200">
          <UIcon name="i-lucide-mic" class="size-3.5 text-primary animate-pulse" />
          {{ titulo }}
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
