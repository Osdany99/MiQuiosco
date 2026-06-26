<script setup lang="ts">
definePageMeta({
  layout: 'auth'
})

const auth = useAuth()
const toast = useToast()
const route = useRoute()

const nombreUsuario = ref('')
const pin = ref('')
const error = ref<string | null>(null)
const requiereCambioPinLocal = ref(false)
const usuarioPendiente = ref<{ id: string, nombre: string, rol: string } | null>(null)

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

    if (response.requiereCambioPin && response.usuario) {
      requiereCambioPinLocal.value = true
      usuarioPendiente.value = response.usuario
      toast.add({
        title: 'Cambio de PIN requerido',
        description: 'Debes cambiar tu PIN antes de continuar.',
        color: 'warning'
      })
      return
    }

    if (response.usuario) {
      toast.add({
        title: 'Bienvenido',
        description: `Hola, ${response.usuario.nombre}.`,
        color: 'success'
      })

      const destino = route.query.redirect as string | undefined
      if (destino) {
        await navigateTo(destino)
        return
      }

      if (response.usuario.rol === 'admin') {
        await navigateTo('/usuarios')
      } else if (response.usuario.rol === 'jefe') {
        await navigateTo('/cuadre')
      } else if (response.usuario.rol === 'trabajador') {
        await navigateTo('/registro-trabajador')
      }
    }
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    error.value = e.data?.statusMessage || e.statusMessage || e.message || 'Error desconocido al iniciar sesión.'
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
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Usuario" required>
          <UInput
            v-model="nombreUsuario"
            placeholder="Ej. admin"
            autocomplete="username"
            :disabled="requiereCambioPinLocal"
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
            :disabled="requiereCambioPinLocal"
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

        <UAlert
          v-if="requiereCambioPinLocal && usuarioPendiente"
          color="warning"
          icon="i-lucide-key"
          :title="`Hola ${usuarioPendiente.nombre}, debes cambiar tu PIN antes de continuar.`"
          description="Te redirigiremos a la pantalla de cambio en un momento."
        />

        <UButton
          type="submit"
          block
          size="lg"
          :loading="auth.cargando.value"
          :disabled="requiereCambioPinLocal"
        >
          Entrar
        </UButton>
      </UForm>
    </UCard>
  </div>
</template>
