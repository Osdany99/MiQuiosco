<script setup>
import { API } from '~/services/api-routes'

definePageMeta({
  middleware: 'admin'
})

const tableRef = ref(null)
const form = reactive({
  nombre: '',
  rol: 'trabajador',
  pin: '',
  activo: true
})
const columns = [
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'rol', header: 'Rol' },
  { accessorKey: 'activo', header: 'Estado' },
  { accessorKey: 'debeCambiarPin', header: 'Cambiar PIN' },
  { accessorKey: 'actions', header: '' }
]

async function toggleActivo(u) {
  try {
    await $fetch(API.usuarios.byId(u.id), {
      method: 'PATCH',
      body: { activo: !u.activo }
    })
    await cargarUsuarios()
    toast.add({
      title: 'Actualizado',
      description: `Usuario ${!u.activo ? 'activado' : 'desactivado'}.`,
      color: 'success'
    })
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || err.statusMessage || err.message,
      color: 'error'
    })
  }
}

async function resetearPin(u) {
  const pin = prompt(`Nuevo PIN para ${u.nombre} (4-6 dígitos):`)
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    if (pin)
      toast.add({
        title: 'PIN inválido',
        description: 'Debe tener 4-6 dígitos.',
        color: 'error'
      })
    return
  }
  try {
    await $fetch(API.usuarios.resetPin(u.id), {
      method: 'PATCH',
      body: { pin }
    })
    toast.add({
      title: 'PIN reseteado',
      description: `Nuevo PIN asignado a ${u.nombre}.`,
      color: 'success'
    })
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || err.statusMessage || err.message,
      color: 'error'
    })
  }
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
        :loading-prop="isUpdatingStatus"
        @reset="resetForm"
      >
        <template #form>
          <UsuarioForm v-model="form" />
        </template>
        <template #activo-cell="{ value, row }">
          <USwitch size="sm" @update:model-value="toggleActivo(row.original)" />
        </template>
        <template #debeCambiarPin-cell="{ value, row }">
          <UBadge
            v-if="value"
            label="Sí"
            color="warning"
            size="sm"
          />
          <UBadge
            v-else
            label="No"
            color="success"
            size="sm"
          />
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
      </BaseTable>
    </BaseHeaderPage>
  </div>
</template>
