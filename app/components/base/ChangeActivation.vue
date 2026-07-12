<template>
  <USwitch
    :default-value="defaultValue"
    :loading="loading"
    loading-icon="i-lucide-loader"
    size="sm"
    @update:model-value="toggleActivo()"
  />
</template>

<script setup>
const { defaultValue, id, entidad, tableRef } = defineProps({
  defaultValue: { type: Boolean, default: false },
  entidad: { type: String, required: true },
  tableRef: { type: Object, default: null },
  id: { type: String, default: null }
})

const { update, loading } = useRepoAction(entidad, { toast: false })

async function toggleActivo() {
  await update(id, { activo: !defaultValue })
  await tableRef?.refresh()
}
</script>
