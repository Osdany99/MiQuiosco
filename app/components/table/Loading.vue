<template>
  <div
    v-if="loading"
    class="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-10 flex items-center justify-center backdrop-blur-[1px]"
  >
    <UIcon name="i-lucide-loader-2" class="w-10 h-10 animate-spin text-primary" />
  </div>
</template>

<script setup>
defineProps({
  loading: { type: Boolean, default: false }
})
</script>
