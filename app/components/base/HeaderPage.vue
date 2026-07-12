<template>
  <div class="space-y-6">
    <div class="flex flex-row flex-wrap items-center justify-between gap-4">
      <div class="flex items-center gap-3 flex-1 min-w-[200px]">
        <UIcon
          v-if="leadingIcon"
          :name="leadingIcon"
          class="size-6 text-muted-foreground shrink-0"
        />
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ title }}
          </h1>
          <p class="text-gray-500 dark:text-gray-400">
            {{ description }}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <slot name="trailing" />
        <UButton
          v-if="showButton"
          icon="i-lucide-plus"
          color="primary"
          size="lg"
          variant="solid"
          :label="titleButton"
          :ui="{ label: 'hidden sm:inline' }"
          @click="$emit('new')"
        />
      </div>
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
  },
  leadingIcon: {
    type: String,
    default: ''
  }
})
defineEmits(['new'])
</script>
