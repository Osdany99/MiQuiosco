<script setup>
const { defaultValue, id, config, tableRef, field, cascadeOff } = defineProps({
  defaultValue: { type: Boolean, default: false },
  config: { type: Object, required: true },
  tableRef: { type: Object, default: null },
  id: { type: String, default: null },
  // Campo booleano a conmutar. Cada columna 'activation' escribe su propio
  // accessorKey: antes siempre se escribía `activo` y el switch de Vende
  // (activoQuiosco) rebotaba sin guardar.
  field: { type: String, default: 'activo' },
  // Al apagar este campo, apaga también este otro en el mismo patch.
  // Ej. producto inactivo no se vende: cascadeOff 'activoQuiosco'.
  cascadeOff: { type: String, default: null }
})

const { update, loading } = useRepo(config)

async function toggleActivo(nuevoValor) {
  const patch = { [field]: nuevoValor }
  if (!nuevoValor && cascadeOff && cascadeOff !== field) patch[cascadeOff] = false
  await update(id, patch)
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
