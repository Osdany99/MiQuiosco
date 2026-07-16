<script setup>
import { toastMsg } from '~/utils/toast'

const { defaultValue, id, config, tableRef } = defineProps({
  defaultValue: { type: Boolean, default: false },
  config: { type: Object, required: true },
  tableRef: { type: Object, default: null },
  id: { type: String, default: null }
})

const { update, loading } = useRepo(config)

async function toggleActivo(nuevoValor) {
  const toastTitle = config?.label
    ? toastMsg('toggled', config.label, { activo: nuevoValor })
    : 'Estado cambiado con éxito'
  await update(id, { activo: nuevoValor }, { toastTitle })
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
