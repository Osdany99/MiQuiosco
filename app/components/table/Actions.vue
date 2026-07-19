<template>
  <div class="flex gap-2 justify-start">
    <UTooltip v-if="showEdit" text="Editar" :delay-duration="0">
      <UButton
        icon="i-lucide-edit"
        size="sm"
        color="secondary"
        variant="ghost"
        @click="$emit('edit', rowData)"
      />
    </UTooltip>
    <UTooltip v-if="showDelete" text="Eliminar" :delay-duration="0">
      <UButton
        icon="i-lucide-trash"
        size="sm"
        color="error"
        variant="ghost"
        @click="$emit('delete', rowData)"
      />
    </UTooltip>
    <UTooltip v-if="showDetails && (!detailsCondition || detailsCondition(rowData))" text="Detalles" :delay-duration="0">
      <UButton
        icon="i-lucide-eye"
        size="sm"
        color="info"
        variant="ghost"
        @click="$emit('details', rowData)"
      />
    </UTooltip>
    <slot name="extra" :row-data="rowData" />
  </div>
</template>

<script setup>
defineProps({
  showEdit: { type: Boolean, default: true },
  showDelete: { type: Boolean, default: true },
  showDetails: { type: Boolean, default: false },
  detailsCondition: { type: Function, default: null },
  rowData: { type: Object, default: () => ({}) }
})

defineEmits(['edit', 'delete', 'details'])
</script>
