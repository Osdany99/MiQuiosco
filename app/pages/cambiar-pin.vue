<script setup>
definePageMeta({
  layout: 'auth'
})

const auth = useAuth()
const toast = useToast()
const route = useRoute()

const pinActual = ref('')
const pinNuevo = ref('')
const pinNuevoConfirmacion = ref('')
const error = ref(null)
const cargando = ref(false)

// Verificar que hay usuario en sesión al cargar la página
if (!auth.usuarioActual.value) {
  toast.add({
    title: 'Sesión requerida',
    description: 'Debes iniciar sesión primero.',
    color: 'warning'
  })
  await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
}

async function onSubmit() {
  error.value = null

  if (!/^\d{4,6}$/.test(pinActual.value)) {
    error.value = 'El PIN actual debe tener entre 4 y 6 dígitos.'
    return
  }

  if (!/^\d{4,6}$/.test(pinNuevo.value)) {
    error.value = 'El PIN nuevo debe tener entre 4 y 6 dígitos.'
    return
  }

  if (pinNuevo.value !== pinNuevoConfirmacion.value) {
    error.value = 'La confirmación del PIN nuevo no coincide.'
    return
  }

  if (pinNuevo.value === pinActual.value) {
    error.value = 'El PIN nuevo debe ser diferente al actual.'
    return
  }

  if (!auth.usuarioActual.value) {
    error.value = 'No hay usuario en sesión. Vuelve a iniciar sesión.'
    return
  }

  cargando.value = true
  try {
    const response = await $fetch(
      '/api/auth/cambiar-pin-inicial',
      {
        method: 'POST',
        body: {
          usuario_id: auth.usuarioActual.value.id,
          pin_actual: pinActual.value,
          pin_nuevo: pinNuevo.value,
          pin_nuevo_confirmacion: pinNuevoConfirmacion.value
        }
      }
    )

    toast.add({
      title: 'PIN actualizado',
      description: 'Tu PIN ha sido cambiado correctamente.',
      color: 'success'
    })

    if (response.usuario) {
      const destino = response.usuario.rol === 'admin' ? '/usuarios' : '/cuadre'
      await navigateTo(destino)
    }
  } catch (err) {
    error.value = err.data?.statusMessage || err.statusMessage || err.message || 'Error al cambiar el PIN.'
  } finally {
    cargando.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-key" class="size-8 text-primary" />
          <div>
            <h1 class="text-xl font-semibold">
              Cambiar PIN
            </h1>
            <p class="text-sm text-muted">
              Primera vez: establece tu PIN personal
            </p>
          </div>
        </div>
      </template>

      <UForm
        :state="{ pinActual, pinNuevo, pinNuevoConfirmacion }"
        class="space-y-4 flex flex-col items-center"
        @submit="onSubmit"
      >
        <UFormField label="PIN actual" required>
          <UInput
            v-model="pinActual"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            autocomplete="current-password"
            size="lg"
            maxlength="6"
          />
        </UFormField>

        <UFormField label="PIN nuevo" required>
          <UInput
            v-model="pinNuevo"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            autocomplete="new-password"
            size="lg"
            maxlength="6"
          />
        </UFormField>

        <UFormField label="Confirmar PIN nuevo" required>
          <UInput
            v-model="pinNuevoConfirmacion"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            autocomplete="new-password"
            size="lg"
            maxlength="6"
          />
        </UFormField>

        <UAlert
          v-if="error"
          color="error"
          icon="i-lucide-alert-circle"
          :title="error"
        />

        <UButton
          type="submit"
          block
          size="lg"
          :loading="cargando"
        >
          Cambiar PIN
        </UButton>
      </UForm>
    </UCard>
  </div>
</template>
