<template>
  <div v-if="pagination" class="flex justify-between items-center px-2">
    <span class="text-sm text-gray-500 dark:text-gray-400">
      {{ total }} resultado{{ total !== 1 ? 's' : '' }}
    </span>
    <UPagination v-model="page" :page-count="pageCount" :total="total" />
  </div>
</template>

<script setup>
const page = defineModel({ type: Number, required: true })

defineProps({
  pagination: { type: Boolean, default: true },
  pageCount: { type: Number, required: true },
  total: { type: Number, required: true }
})
</script>
