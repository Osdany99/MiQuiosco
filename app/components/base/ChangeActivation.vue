<script setup>
const { defaultValue, id, config, tableRef } = defineProps({
  defaultValue: { type: Boolean, default: false },
  config: { type: Object, required: true },
  tableRef: { type: Object, default: null },
  id: { type: String, default: null }
})

const { update, loading } = useRepo(config)

async function toggleActivo(nuevoValor) {
  await update(id, { activo: nuevoValor })
  await tableRef?.refresh()
}
</script>

<template>
  <USwitch
    :model-value="defaultValue"
    :loading="loading"
    loading-icon="i-lucide-loader"
    size="sm"
    @update:model-value="toggleActivo($event)"
  />
</template>
