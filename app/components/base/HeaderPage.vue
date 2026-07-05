<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
          {{ title }}
        </h1>
        <p class="text-gray-500 dark:text-gray-400">
          {{ description }}
        </p>
      </div>
      <UButton
        v-if="showButton"
        icon="i-lucide-plus"
        color="primary"
        size="lg"
        variant="solid"
        :label="titleButton"
        @click="$emit('new')"
      />
    </div>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  titleButton: {
    type: String,
    default: 'Adicionar'
  },
  showButton: {
    type: Boolean,
    default: true
  }
})
defineEmits(['new'])
</script>
