<script setup>
import { usuarioSchema } from '~~/shared/schemas/usuario'
import { usuarios as tableUsuarios } from '~/config/tables'

definePageMeta({
  middleware: ['jefe']
})

const fields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', props: { class: 'w-full', maxlength: 100 } },
  { name: 'telefono', label: 'Teléfono', type: 'text', required: false, placeholder: 'Teléfono', props: { class: 'w-full' } },
  { name: 'notas', label: 'Notas', type: 'textarea', required: false, placeholder: 'Notas adicionales', props: { class: 'w-full', rows: 3 } },
  { name: 'rol', label: 'Rol', type: 'select', required: true, items: [
    { label: 'Jefe', value: 'jefe' },
    { label: 'Trabajador', value: 'trabajador' },
    { label: 'Cliente', value: 'cliente' }
  ], valueKey: 'value', labelKey: 'label', props: { class: 'w-full' } },
  { name: 'salario', label: 'Salario base', type: 'number', required: false, placeholder: 'Salario', hidden: form => form?.rol !== 'trabajador', props: { class: 'w-full', min: 0 } },
  { name: 'pin', label: 'PIN', type: 'password', required: true, maxlength: 6, hidden: form => !!form?.id, props: { class: 'w-full', mask: true } },
  { name: 'activo', label: 'Activo', type: 'switch', required: true, props: { uncheckedIcon: 'i-lucide-x', checkedIcon: 'i-lucide-check', class: 'w-full' } }
]

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'telefono', header: 'Teléfono' },
  { accessorKey: 'notas', header: 'Notas' },
  { accessorKey: 'rol', header: 'Rol' },
  { accessorKey: 'salario', header: 'Salario', cell: 'salario' },
  { accessorKey: 'activo', header: 'Estado', cell: 'activation' },
  { accessorKey: 'action', header: 'Acciones' }
]

const tableRef = ref(null)
const formRef = ref(null)
const form = ref({ id: null, nombre: '', telefono: '', notas: '', rol: 'trabajador', salario: null, pin: '', activo: true })

const showPinModal = ref(false)
const pinUsuario = ref(null)
const pinForm = ref({ pin: '' })
const pinFormRef = ref(null)
const { patch, loading: pinLoading } = useRepo(tableUsuarios)

function abrirPinModal(usuario) {
  pinUsuario.value = usuario
  pinForm.value = { pin: '' }
  showPinModal.value = true
}

async function guardarPin() {
  try {
    await pinFormRef.value?.validate()
  } catch {
    return
  }
  const { error } = await patch(pinUsuario.value.id, { pin: pinForm.value.pin }, { toastTitle: 'PIN actualizado correctamente' })
  if (!error) {
    showPinModal.value = false
    await tableRef.value?.refresh()
  }
}
</script>

<template>
  <BaseHeaderPage
    :title="tableUsuarios.label.plural"
    description="Gestiona los usuarios del puesto"
    :title-button="'Nuevo ' + tableUsuarios.label.singular"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :config="tableUsuarios"
      :columns="columns"
      :form-ref="formRef"
    >
      <template #form>
        <BaseForm
          ref="formRef"
          v-model="form"
          :fields="fields"
          :schema="usuarioSchema"
        />
      </template>

      <template #salario-cell="{ row }">
        {{ row.original.salario != null ? fmtPrecio(row.original.salario) : 'No tiene' }}
      </template>

      <template #row-actions-extra="{ rowData }">
        <UTooltip text="Cambiar PIN" :delay-duration="0">
          <UButton
            icon="i-lucide-key"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="abrirPinModal(rowData)"
          />
        </UTooltip>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="showPinModal"
      title="Cambiar PIN"
      confirm-text="Guardar PIN"
      :loading="pinLoading"
      @confirm="guardarPin"
    >
      <UsuarioPin ref="pinFormRef" v-model="pinForm" />
    </BaseDialog>
  </BaseHeaderPage>
</template>
