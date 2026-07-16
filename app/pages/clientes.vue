<script setup>
import { clienteSchema } from '~~/shared/schemas/cliente'
import { clientes as config } from '~/config/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre del cliente', colSpan: 'sm:col-span-2', props: { class: 'w-full', maxlength: 200 } },
  { name: 'telefono', label: 'Teléfono', type: 'text', required: false, placeholder: 'Teléfono opcional', colSpan: 'sm:col-span-2', props: { class: 'w-full' } },
  { name: 'notas', label: 'Notas', type: 'textarea', required: false, placeholder: 'Notas opcionales', colSpan: 'sm:col-span-2', props: { class: 'w-full' } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, colSpan: 'sm:col-span-2', props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'telefono', header: 'Teléfono' },
  { accessorKey: 'notas', header: 'Notas' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]

const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', telefono: '', notas: '', activo: true })
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Gestiona los clientes para cuentas de fiado"
    :title-button="'Nuevo ' + config.label.singular"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="config"
      :columns="columns"
      :form-ref="formRef"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="clienteSchema"
        />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
