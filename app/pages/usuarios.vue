<script setup>
import { API } from '~/services/api-routes'

definePageMeta({
  middleware: 'admin'
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
  activo: true
})
const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'rol', header: 'Rol' },
  { accessorKey: 'activo', header: 'Activo' },
  { accessorKey: 'debeCambiarPin', header: 'Cambiar PIN' },
  { accessorKey: 'action', header: 'Acciones' }
]

const { update: apiUpdate, loading: pinResetLoading } = useCrud(API.usuarios.list)
const togglingUserId = ref(null)

async function toggleActivo(u) {
  togglingUserId.value = u.id
  const { error } = await apiUpdate(u.id, { activo: !u.activo })
  if (!error) {
    await tableRef.value?.refresh()
  }
  togglingUserId.value = null
}

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
  <div class="space-y-4">
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
        :submit-fields="['nombre', 'rol', 'pin', 'activo']"
      >
        <template #form>
          <UsuarioForm ref="usuarioFormRef" v-model="form" />
        </template>
        <template #activo-cell="{ row }">
          <USwitch
            :default-value="row.original.activo"
            :loading="togglingUserId === row.original.id"
            loading-icon="i-lucide-loader"
            size="sm"
            @update:model-value="toggleActivo(row.original)"
          />
        </template>
        <template #debeCambiarPin-cell="{ row }">
          <BaseBadgeTrueOrFalse :value="row.original.debeCambiarPin" color-true="warning" color-false="success" />
        </template>
        <template #rol-cell="{ row }">
          <UBadge
            :label="row.original.rol"
            :color="
              row.original.rol === 'admin'
                ? 'primary'
                : row.original.rol === 'jefe'
                  ? 'info'
                  : 'neutral'
            "
          />
        </template>
        <template #row-actions-extra="{ rowData }">
          <UButton
            icon="i-lucide-key"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="abrirResetPin(rowData)"
          />
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
  </div>
</template>
