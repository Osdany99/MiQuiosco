<script setup>
definePageMeta({
  middleware: ['jefe']
})

const tableRef = ref(null)
const clienteFormRef = ref(null)

const form = ref({
  id: null,
  nombre: '',
  telefono: '',
  notas: '',
  activo: true
})

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'telefono', header: 'Teléfono' },
  { accessorKey: 'notas', header: 'Notas' },
  { accessorKey: 'activo', header: 'Estado' },
  { accessorKey: 'action', header: 'Acciones' }
]
</script>

<template>
  <BaseHeaderPage
    title="Clientes"
    description="Gestiona los clientes para cuentas de fiado"
    title-button="Nuevo Cliente"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :api-url="API.clientes.list"
      :columns="columns"
      empty-state="No se encontraron clientes"
      modal-title="Cliente"
      :form-ref="clienteFormRef"
      :submit-fields="['nombre', 'telefono', 'notas', 'activo']"
    >
      <template #form>
        <ClienteForm ref="clienteFormRef" v-model="form" />
      </template>

      <template #activo-cell="{ row }">
        <BaseChangeActivation
          :id="row.original.id"
          :default-value="row.original.activo"
          :api-url="API.clientes.list"
          :table-ref="tableRef"
        />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
