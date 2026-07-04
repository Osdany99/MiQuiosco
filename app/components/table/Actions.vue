<template>
  <div class="flex gap-2 justify-start">
    <UButton
      v-if="showEdit"
      icon="i-lucide-edit"
      size="sm"
      color="secondary"
      variant="ghost"
      @click="$emit('edit', rowData)"
    />
    <UButton
      v-if="showDelete"
      icon="i-lucide-trash"
      size="sm"
      color="error"
      variant="ghost"
      @click="$emit('delete', rowData)"
    />
  </div>
</template>

<script setup>
defineProps({
  showEdit: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: true },
  rowData: { type: Object, default: () => ({}) }
})

defineEmits(['edit', 'delete'])
</script>
