<template>
  <div class="flex justify-end items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
    <USelectMenu
      v-model="visibleHeaders"
      :options="columnHeaders"
      :items="columnHeaders"
      multiple
      placeholder="Columnas visibles"
      class="w-48"
    >
      <template #label>
        <UIcon name="i-lucide-columns" class="w-4 h-4 mr-2 inline-block align-text-bottom" />
        Columnas ({{ visibleHeaders.length }})
      </template>
    </USelectMenu>
  </div>
</template>

<script setup>
const visibleHeaders = defineModel({ type: Array, required: true })

defineProps({
  columnHeaders: { type: Array, required: true }
})
</script>
