<template>
  <div class="flex items-center gap-2">
    <UTooltip text="Restablecer todo" :delay-duration="500">
      <UButton
        icon="i-lucide-rotate-ccw"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="$emit('reload')"
      />
    </UTooltip>
    <slot />
  </div>
</template>

<script setup>
defineEmits(['reload'])
</script>
