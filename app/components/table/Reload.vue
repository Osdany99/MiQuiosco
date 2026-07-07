<template>
  <UTooltip text="Restablecer todo" :delay-duration="500">
    <UButton
      icon="i-lucide-rotate-ccw"
      variant="ghost"
      color="neutral"
      size="sm"
      @click="$emit('reload')"
    />
  </UTooltip>
</template>

<script setup>
defineEmits(['reload'])
</script>
