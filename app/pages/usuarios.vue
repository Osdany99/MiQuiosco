<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

const toast = useToast()

interface Usuario {
  id: string
  nombre: string
  rol: 'admin' | 'jefe' | 'trabajador'
  activo: boolean
  debeCambiarPin: boolean
  creadoEn: string | number
  actualizadoEn: string | number
}

const usuarios = ref<Usuario[]>([])
const cargando = ref(false)
const showModal = ref(false)
const editando = ref<Usuario | null>(null)
const form = reactive<Partial<Usuario>>({
  nombre: '',
  rol: 'trabajador',
  pin: '',
  activo: true
})
const formError = ref<string | null>(null)

async function cargarUsuarios() {
  cargando.value = true
  try {
    const data = await $fetch<Usuario[]>('/api/usuarios')
    usuarios.value = data
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Error',
      description: e.data?.statusMessage || e.statusMessage || e.message || 'No se pudieron cargar los usuarios.',
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
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    formError.value = e.data?.statusMessage || e.statusMessage || e.message || 'Error al guardar.'
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

function abrirModalEditar(u: Usuario) {
  editando.value = u
  form.nombre = u.nombre
  form.rol = u.rol
  form.pin = ''
  form.activo = u.activo
  formError.value = null
  showModal.value = true
}

async function toggleActivo(u: Usuario) {
  try {
    await $fetch(`/api/usuarios/${u.id}`, {
      method: 'PATCH',
      body: { activo: !u.activo }
    })
    await cargarUsuarios()
    toast.add({ title: 'Actualizado', description: `Usuario ${!u.activo ? 'activado' : 'desactivado'}.`, color: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.statusMessage || e.message, color: 'error' })
  }
}

async function resetearPin(u: Usuario) {
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
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.statusMessage || e.message, color: 'error' })
  }
}

onMounted(cargarUsuarios)

const columns = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'rol', label: 'Rol' },
  { key: 'activo', label: 'Estado' },
  { key: 'debeCambiarPin', label: 'Cambiar PIN' },
  { key: 'actions', label: '' }
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
        :rows="usuarios"
        :columns="columns"
        :loading="cargando"
        striped
      >
        <template #rol="{ row }">
          <UBadge
            :label="row.rol"
            :color="row.rol === 'admin' ? 'primary' : row.rol === 'jefe' ? 'info' : 'neutral'"
          />
        </template>
        <template #activo="{ row }">
          <USwitch
            v-model="row.activo"
            size="sm"
            @update:model-value="toggleActivo(row)"
          />
        </template>
        <template #debeCambiarPin="{ row }">
          <UBadge
            v-if="row.debeCambiarPin"
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
        <template #actions="{ row }">
          <UButtonGroup>
            <UButton
              icon="i-lucide-edit-2"
              variant="ghost"
              size="sm"
              @click="abrirModalEditar(row)"
            />
            <UButton
              icon="i-lucide-key"
              variant="ghost"
              size="sm"
              @click="resetearPin(row)"
            />
          </UButtonGroup>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="showModal" :ui="{ width: 'max-w-md' }">
      <template #header>
        {{ editando.value ? 'Editar usuario' : 'Nuevo usuario' }}
      </template>

      <UForm :state="form" class="space-y-4" @submit="onSubmit">
        <UFormField label="Nombre" required>
          <UInput v-model="form.nombre" placeholder="Nombre completo" />
        </UFormField>

        <UFormField label="Rol" required>
          <USelectMenu
            v-model="form.rol"
            :items="[
              { label: 'Admin', value: 'admin' },
              { label: 'Jefe', value: 'jefe' },
              { label: 'Trabajador', value: 'trabajador' }
            ]"
          />
        </UFormField>

        <UFormField v-if="!editando.value" label="PIN inicial" required>
          <UInput
            v-model="form.pin"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            maxlength="6"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField v-if="editando.value" label="Nuevo PIN (dejar vacío para no cambiar)">
          <UInput
            v-model="form.pin"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            maxlength="6"
            autocomplete="new-password"
          />
        </UFormField>

        <UFormField v-if="editando.value" label="Activo">
          <USwitch v-model="form.activo" />
        </UFormField>

        <UAlert
          v-if="formError"
          color="error"
          icon="i-lucide-alert-circle"
          :title="formError"
        />

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" label="Cancelar" @click="showModal.value = false" />
            <UButton type="submit" :loading="cargando" label="Guardar" />
          </div>
        </template>
      </UForm>
    </UModal>
  </div>
</template>
