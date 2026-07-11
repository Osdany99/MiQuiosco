<script setup>
definePageMeta({
  layout: 'auth'
})

const auth = useAuth()
const toast = useToast()
const route = useRoute()

const nombreUsuario = ref('')
const pin = ref('')
const error = ref(null)

async function onSubmit() {
  error.value = null

  if (!nombreUsuario.value.trim()) {
    error.value = 'Ingresa tu nombre de usuario.'
    return
  }

  if (!/^\d{4,6}$/.test(pin.value)) {
    error.value = 'El PIN debe tener entre 4 y 6 dígitos numéricos.'
    return
  }

  try {
    const response = await auth.login(nombreUsuario.value, pin.value)

    if (response.usuario) {
      toast.add({
        title: 'Bienvenido',
        description: `Hola, ${response.usuario.nombre}.`,
        color: 'success'
      })

      const destino = route.query.redirect

      if (destino) {
        await navigateTo(destino)
        return
      }
      await navigateTo('/cuadre')
    }
  } catch (err) {
    error.value = err.data?.statusMessage || err.statusMessage || err.message || 'Error desconocido al iniciar sesión.'
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-store" class="size-8 text-primary" />
          <div>
            <h1 class="text-xl font-semibold">
              MiQuiosco
            </h1>
            <p class="text-sm text-muted">
              Iniciar sesión
            </p>
          </div>
        </div>
      </template>

      <UForm
        :state="{ nombreUsuario, pin }"
        class="space-y-4 flex flex-col items-center"
        @submit="onSubmit"
      >
        <UFormField label="Usuario" required>
          <UInput
            v-model="nombreUsuario"
            placeholder="Ej. jefe"
            autocomplete="username"
            size="lg"
          />
        </UFormField>

        <UFormField label="PIN" required>
          <UInput
            v-model="pin"
            type="password"
            placeholder="••••"
            inputmode="numeric"
            autocomplete="current-password"
            size="lg"
            :maxlength="6"
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
          size="md"
          :loading="auth.cargando.value"
        >
          Entrar
        </UButton>
      </UForm>
    </UCard>
  </div>
</template>
