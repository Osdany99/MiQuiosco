<template>
  <div class="flex justify-end items-center">
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
const visibleHeaders = defineModel('visibleHeaders', { type: Array, required: true })

defineProps({
  columnHeaders: { type: Array, required: true }
})
</script>
