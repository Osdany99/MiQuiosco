<script setup>
import { proveedorSchema } from '../../shared/schemas/proveedor'
import { proveedores as tableProveedores } from '../../shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre o marca', props: { class: 'w-full', maxlength: 100 } },
  { name: 'telefono', label: 'Teléfono', type: 'text', required: false, placeholder: 'Teléfono', props: { class: 'w-full' } },
  { name: 'lugar', label: 'Lugar de la tienda', type: 'text', required: false, placeholder: 'Mercado del centro, local 4...', colSpan: 'sm:col-span-2', props: { class: 'w-full', maxlength: 150 } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'telefono', header: 'Teléfono' },
  { accessorKey: 'lugar', header: 'Lugar' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]

const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', telefono: '', lugar: '', activo: true })
</script>

<template>
  <BaseHeaderPage
    :title="tableProveedores.label.plural"
    description="Lugares de compra del puesto"
    :title-button="'Nuevo ' + tableProveedores.label.singular"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="tableProveedores"
      :columns="columns"
      :form-ref="formRef"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="proveedorSchema"
        />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
