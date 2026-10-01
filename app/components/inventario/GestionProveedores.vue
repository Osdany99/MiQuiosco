<template>
  <BaseDialog
    v-model="isOpen"
    title="Proveedores"
    description="Catálogo opcional. Si un proveedor tiene compras, no se puede borrar: desactívalo."
    cancel-text="Cerrar"
    :hide-confirm="true"
    @cancel="isOpen = false"
  >
    <div class="space-y-3">
      <UTable :data="proveedores" :columns="columns" empty="Sin proveedores">
        <template #activo-cell="{ row }">
          {{ row.original.activo ? 'Activo' : 'Inactivo' }}
        </template>
        <template #acciones-cell="{ row }">
          <div class="flex gap-1 justify-end">
            <UButton
              icon="i-lucide-pencil"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="editar(row.original)"
            />
            <UButton
              :icon="row.original.activo ? 'i-lucide-eye-off' : 'i-lucide-eye'"
              size="xs"
              color="neutral"
              variant="ghost"
              :title="row.original.activo ? 'Desactivar' : 'Activar'"
              @click="alternar(row.original)"
            />
          </div>
        </template>
      </UTable>

      <div class="border-t pt-3 space-y-2">
        <p class="text-sm font-medium">
          {{ editando ? 'Editar proveedor' : 'Nuevo proveedor' }}
        </p>
        <div class="flex gap-2">
          <UInput v-model="form.nombre" placeholder="Nombre..." class="flex-1" />
          <UInput v-model="form.telefono" placeholder="Teléfono..." class="w-32" />
          <UButton
            size="sm"
            :loading="guardando"
            :disabled="!form.nombre.trim()"
            @click="guardar"
          >
            {{ editando ? 'Guardar' : 'Agregar' }}
          </UButton>
          <UButton
            v-if="editando"
            size="sm"
            variant="ghost"
            @click="cancelarEdicion"
          >
            Cancelar
          </UButton>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['cambio'])

const inv = useInventario()
const toast = useToast()

const proveedores = ref([])
const guardando = ref(false)
const editando = ref(null)
const form = ref({ nombre: '', telefono: '' })

const columns = [
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'telefono', header: 'Teléfono' },
  { accessorKey: 'activo', header: 'Estado' },
  { accessorKey: 'acciones', header: '' }
]

watch(isOpen, async (open) => {
  if (open) {
    editando.value = null
    form.value = { nombre: '', telefono: '' }
    await recargar()
  }
})

async function recargar() {
  proveedores.value = await inv.cargarProveedores() ?? []
}

function repo() {
  return inv.proveedoresRepo.value
}

async function guardar() {
  guardando.value = true
  try {
    const payload = { nombre: form.value.nombre.trim(), telefono: form.value.telefono.trim() || null }
    if (editando.value) {
      await repo().update(editando.value.id, payload)
    } else {
      await repo().create(payload)
    }
    editando.value = null
    form.value = { nombre: '', telefono: '' }
    await recargar()
    emit('cambio')
  } catch (err) {
    toast.add({ title: 'Error', description: err.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}

function editar(row) {
  editando.value = row
  form.value = { nombre: row.nombre ?? '', telefono: row.telefono ?? '' }
}

function cancelarEdicion() {
  editando.value = null
  form.value = { nombre: '', telefono: '' }
}

async function alternar(row) {
  try {
    await repo().update(row.id, { activo: !row.activo })
    await recargar()
    emit('cambio')
  } catch (err) {
    toast.add({ title: 'Error', description: err.message, color: 'error' })
  }
}
</script>
