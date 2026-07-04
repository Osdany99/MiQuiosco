<script setup>
definePageMeta({
  middleware: 'admin'
})

const toast = useToast()

const usuarios = ref([])
const cargando = ref(false)
const showModal = ref(false)
const editando = ref(null)
const form = reactive({
  nombre: '',
  rol: 'trabajador',
  pin: '',
  activo: true
})
const formError = ref(null)

async function cargarUsuarios() {
  cargando.value = true
  try {
    const data = await $fetch('/api/usuarios')
    usuarios.value = data
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err.data?.statusMessage || err.statusMessage || err.message || 'No se pudieron cargar los usuarios.',
      color: 'error'
    })
  } finally {
    cargando.value = false
  }
}

async function onSubmit() {
  formError.value = null

  if (!form.nombre?.trim()) {
    formError.value = 'El nombre es obligatorio.'
    return
  }

  if (editando.value && !form.pin?.trim()) {
    formError.value = 'El PIN es obligatorio al crear un usuario.'
    return
  }

  if (form.pin && !/^\d{4,6}$/.test(form.pin)) {
    formError.value = 'El PIN debe tener entre 4 y 6 dígitos.'
    return
  }

  try {
    if (editando.value) {
      await $fetch(`/api/usuarios/${editando.value.id}`, {
        method: 'PATCH',
        body: {
          nombre: form.nombre,
          rol: form.rol,
          activo: form.activo
        }
      })
      toast.add({ title: 'Actualizado', description: 'Usuario modificado correctamente.', color: 'success' })
    } else {
      await $fetch('/api/usuarios', {
        method: 'POST',
        body: {
          nombre: form.nombre,
          rol: form.rol,
          pin: form.pin
        }
      })
      toast.add({ title: 'Creado', description: 'Usuario creado correctamente.', color: 'success' })
    }
    showModal.value = false
    await cargarUsuarios()
  } catch (err) {
    formError.value = err.data?.statusMessage || err.statusMessage || err.message || 'Error al guardar.'
  }
}

function abrirModalCrear() {
  editando.value = null
  form.nombre = ''
  form.rol = 'trabajador'
  form.pin = ''
  form.activo = true
  formError.value = null
  showModal.value = true
}

function abrirModalEditar(u) {
  editando.value = u
  form.nombre = u.nombre
  form.rol = u.rol
  form.pin = ''
  form.activo = u.activo
  formError.value = null
  showModal.value = true
}

async function toggleActivo(u) {
  try {
    await $fetch(`/api/usuarios/${u.id}`, {
      method: 'PATCH',
      body: { activo: !u.activo }
    })
    await cargarUsuarios()
    toast.add({ title: 'Actualizado', description: `Usuario ${!u.activo ? 'activado' : 'desactivado'}.`, color: 'success' })
  } catch (err) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || err.statusMessage || err.message, color: 'error' })
  }
}

async function resetearPin(u) {
  const pin = prompt(`Nuevo PIN para ${u.nombre} (4-6 dígitos):`)
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    if (pin) toast.add({ title: 'PIN inválido', description: 'Debe tener 4-6 dígitos.', color: 'error' })
    return
  }
  try {
    await $fetch(`/api/usuarios/${u.id}/pin`, {
      method: 'PATCH',
      body: { pin }
    })
    toast.add({ title: 'PIN reseteado', description: `Nuevo PIN asignado a ${u.nombre}.`, color: 'success' })
  } catch (err) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || err.statusMessage || err.message, color: 'error' })
  }
}

onMounted(cargarUsuarios)

const columns = [
  { accessorKey: 'nombre', header: 'Nombre' },
  { accessorKey: 'rol', header: 'Rol' },
  { accessorKey: 'activo', header: 'Estado' },
  { accessorKey: 'debeCambiarPin', header: 'Cambiar PIN' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="space-y-4">
    <UPageHeader
      title="Usuarios"
      description="Gestión de usuarios del sistema"
      leading-icon="i-lucide-users"
      class="pb-0"
    >
      <template #trailing>
        <UButton icon="i-lucide-plus" label="Nuevo usuario" @click="abrirModalCrear" />
      </template>
    </UPageHeader>

    <UCard>
      <UTable
        :data="usuarios"
        :columns="columns"
        :loading="cargando"
        striped
      >
        <template #rol-cell="{ row }">
          <UBadge
            :label="row.original.rol"
            :color="row.original.rol === 'admin' ? 'primary' : row.original.rol === 'jefe' ? 'info' : 'neutral'"
          />
        </template>
        <template #activo-cell="{ row }">
          <USwitch
            v-model="row.original.activo"
            size="sm"
            @update:model-value="toggleActivo(row.original)"
          />
        </template>
        <template #debeCambiarPin-cell="{ row }">
          <UBadge
            v-if="row.original.debeCambiarPin"
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
        <template #actions-cell="{ row }">
          <UButton
            icon="i-lucide-edit-2"
            variant="ghost"
            size="sm"
            @click="abrirModalEditar(row.original)"
          />
          <UButton
            icon="i-lucide-key"
            variant="ghost"
            size="sm"
            @click="resetearPin(row.original)"
          />
        </template>
      </UTable>
    </UCard>

    <BaseDialog
      v-model="showModal"
      :title="editando ? 'Editar usuario' : 'Nuevo usuario'"
      :loading="cargando"
      @confirm="onSubmit"
      @cancel="showModal=false"
    >
      <UForm :state="form" class="space-y-4" @submit="onSubmit">
        <UFormField v-if="!editando" label="PIN inicial" required>
          <UInput
            v-model="form.pin"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            maxlength="6"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField v-if="editando" label="Nuevo PIN (dejar vacío para no cambiar)">
          <UInput
            v-model="form.pin"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            maxlength="6"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField v-if="editando" label="Activo">
          <USwitch v-model="form.activo" />
        </UFormField>

        <UAlert
          v-if="formError"
          color="error"
          icon="i-lucide-alert-circle"
          :title="formError"
        />
      </Uform>
    </BaseDialog>
  </div>
</template>
