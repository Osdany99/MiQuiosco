<script setup>
definePageMeta({
  middleware: ['jefe']
})

const tableRef = ref(null)
const usuarioFormRef = ref(null)
const pinResetOpen = ref(false)
const pinResetForm = ref({ pin: '' })
const pinResetUser = ref(null)
const pinResetRef = ref(null)
const form = ref({
  id: null,
  nombre: '',
  rol: 'trabajador',
  pin: '',
  salario: 600,
  activo: true
})
const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'rol', header: 'Rol' },
  { accessorKey: 'salario', header: 'Salario' },
  { accessorKey: 'debeCambiarPin', header: 'Cambiar PIN' },
  { accessorKey: 'activo', header: 'Activo' },
  { accessorKey: 'action', header: 'Acciones' }
]

const { update: apiUpdate, loading: pinResetLoading } = useCrud(API.usuarios.list)

function abrirResetPin(user) {
  pinResetUser.value = user
  pinResetForm.value = { pin: '' }
  pinResetOpen.value = true
}

async function confirmarResetPin() {
  try {
    await pinResetRef.value?.validate()
  } catch { return }
  await apiUpdate(pinResetUser.value.id, { pin: pinResetForm.value.pin })
  pinResetOpen.value = false
  await tableRef.value?.refresh()
}
</script>

<template>
  <BaseHeaderPage
    title="Usuarios"
    description="Gestiona los usuarios del sistema"
    title-button="Nuevo Usuario"
    @new="tableRef.openAdd()"
  >
    <BaseTable
      ref="tableRef"
      v-model="form"
      :api-url="API.usuarios.list"
      :columns="columns"
      empty-state="No se encontraron usuarios"
      modal-title="Usuario"
      :form-ref="usuarioFormRef"
      :submit-fields="['nombre', 'rol', 'pin', 'salario', 'activo']"
    >
      <template #form>
        <UsuarioForm ref="usuarioFormRef" v-model="form" />
      </template>
      <template #activo-cell="{ row }">
        <BaseChangeActivation
          :id="row.original.id"
          :default-value="row.original.activo"
          :api-url="API.usuarios.list"
          :table-ref="tableRef"
        />
      </template>
      <template #debeCambiarPin-cell="{ row }">
        <BaseBadgeTrueOrFalse :value="row.original.debeCambiarPin" color-true="warning" color-false="success" />
      </template>
      <template #rol-cell="{ row }">
        <UBadge
          :label="row.original.rol"
          :color="row.original.rol === 'jefe' ? 'info' : 'neutral'"
        />
      </template>
      <template #salario-cell="{ row }">
        <span v-if="row.original.salario != null" class="font-mono">{{ fmtPrecio(row.original.salario) }}</span>
        <span v-else class="text-gray-400">—</span>
      </template>
      <template #row-actions-extra="{ rowData }">
        <UTooltip text="Cambiar pin" :delay-duration="0">
          <UButton
            icon="i-lucide-key"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="abrirResetPin(rowData)"
          />
        </UTooltip>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="pinResetOpen"
      title="Cambiar PIN"
      confirm-text="Guardar PIN"
      :loading="pinResetLoading"
      @confirm="confirmarResetPin"
      @cancel="pinResetOpen = false"
    >
      <UsuarioPin ref="pinResetRef" v-model="pinResetForm" />
    </BaseDialog>
  </BaseHeaderPage>
</template>
