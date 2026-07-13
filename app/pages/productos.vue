<script setup>
import { producto } from '~~/shared/entities'

definePageMeta({
  middleware: ['jefe']
})

const { entity, columns, form, submitFields, tableRef, formRef, modalTitle } = useEntityTable(producto)

const showHistorial = ref(false)
const historialProducto = ref(null)

const { patch, loading: reorderLoading } = useRepoAction(producto, { toast: false })

function esPrimero(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  return rows.findIndex(x => x.id === p.id) === 0
}

function esUltimo(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  return idx === -1 || idx === rows.length - 1
}

async function moverArriba(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  if (idx <= 0) return

  const actual = rows[idx]
  const anterior = rows[idx - 1]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    patch(actual.id, { orden: anterior.orden }),
    patch(anterior.id, { orden: actual.orden })
  ])

  if (!error1 && !error2) {
    await tableRef.value?.refresh()
  }
}

async function moverAbajo(p) {
  const rows = toValue(tableRef.value?.data) ?? []
  const idx = rows.findIndex(x => x.id === p.id)
  if (idx === -1 || idx >= rows.length - 1) return

  const actual = rows[idx]
  const siguiente = rows[idx + 1]

  const [{ error: error1 }, { error: error2 }] = await Promise.all([
    patch(actual.id, { orden: siguiente.orden }),
    patch(siguiente.id, { orden: actual.orden })
  ])

  if (!error1 && !error2) {
    await tableRef.value?.refresh()
  }
}
</script>

<template>
  <BaseHeaderPage
    title="Productos"
    description="Catálogo de productos del puesto"
    title-button="Nuevo Producto"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :entidad="entity"
      :columns="columns"
      empty-state="No se encontraron productos"
      :modal-title="modalTitle"
      :form-ref="formRef"
      :submit-fields="submitFields"
      :pagination="false"
    >
      <template #form>
        <BaseEntityForm ref="formRef" :entity="entity" v-model="form" />
      </template>

      <template #orden-cell="{ row }">
        <div class="flex items-center gap-2">
          <UButton
            icon="i-lucide-chevron-up"
            variant="ghost"
            size="xs"
            :disabled="reorderLoading || esPrimero(row.original)"
            @click="moverArriba(row.original)"
          />
          <span class="font-mono">{{ row.original.orden }}</span>
          <UButton
            icon="i-lucide-chevron-down"
            variant="ghost"
            size="xs"
            :disabled="reorderLoading || esUltimo(row.original)"
            @click="moverAbajo(row.original)"
          />
        </div>
      </template>

      <template #row-actions-extra="{ rowData }">
        <UTooltip text="Ver historial de precios" :delay-duration="0">
          <UButton
            icon="i-lucide-clock"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="historialProducto = rowData; showHistorial = true"
          />
        </UTooltip>
      </template>
    </BaseTable>
    <ProductoHistorialPrecios v-model="showHistorial" :producto="historialProducto" />
  </BaseHeaderPage>
</template>
