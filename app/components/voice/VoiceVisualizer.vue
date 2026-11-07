<script setup>
defineProps({
  listening: { type: Boolean, default: false },
  intensity: { type: Number, default: 0.6 }
})

const barras = Array.from({ length: 7 })
</script>>

<template>
  <div
    class="voice-visualizer"
    :class="{ listening: listening }"
    aria-hidden="true"
  >
    <span v-for="(n, i) in barras" :key="i" class="bar" />
  </div>
</template>

<style scoped>
.voice-visualizer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 3px;
  width: 44px;
  height: 22px;
  padding: 0 4px;
  border-radius: 9999px;
  background: color-mix(in srgb, var(--ui-primary, #6366f1) 14%, transparent);
  overflow: hidden;
}

.bar {
  display: block;
  width: 3px;
  height: 30%;
  border-radius: 9999px;
  background: var(--ui-primary, #6366f1);
  transform-origin: center;
  transition: height 160ms ease;
}

.voice-visualizer.listening .bar {
  animation: voice-wave 0.9s ease-in-out infinite;
}

.bar:nth-child(1) { animation-delay: 0s; }
.bar:nth-child(2) { animation-delay: 0.09s; }
.bar:nth-child(3) { animation-delay: 0.18s; }
.bar:nth-child(4) { animation-delay: 0.27s; }
.bar:nth-child(5) { animation-delay: 0.36s; }
.bar:nth-child(6) { animation-delay: 0.45s; }
.bar:nth-child(7) { animation-delay: 0.54s; }

@keyframes voice-wave {
  0%, 100% { transform: scaleY(0.35); opacity: 0.7; }
  50% { transform: scaleY(1); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .voice-visualizer.listening .bar {
    animation: none;
    height: 55%;
  }
}
</style>
EOF
