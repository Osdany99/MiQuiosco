<script setup>
definePageMeta({
  layout: 'auth'
})

const admin = useAdminAuth()
const route = useRoute()

const nombreUsuario = ref('')
const pin = ref('')
const error = ref(null)
const enviando = ref(false)

const avisoSesion = computed(() => route.query.reason === 'session_expired'
  ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
  : null
)

onMounted(async () => {
  admin.cargarDesdeAlmacen()
  if (admin.sesionVigente()) {
    await navigateTo('/admin')
  }
})

async function entrar() {
  error.value = null

  if (!nombreUsuario.value.trim()) {
    error.value = 'Ingresa tu nombre de usuario.'
    return
  }

  if (!/^\d{4,6}$/.test(pin.value)) {
    error.value = 'El PIN debe tener entre 4 y 6 dígitos numéricos.'
    return
  }

  enviando.value = true
  try {
    await admin.iniciarSesion(nombreUsuario.value, pin.value)

    const destino = typeof route.query.redirect === 'string'
      && route.query.redirect.startsWith('/admin')
      && route.query.redirect !== '/admin/login'
      ? route.query.redirect
      : '/admin'

    await navigateTo(destino)
  } catch (err) {
    error.value = mensajeErrorAdmin(err, 'No se pudo iniciar sesión.')
  } finally {
    enviando.value = false
  }
}
</script>

<template>
  <div class="w-full max-w-md">
    <UCard>
      <template #header>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-shield-check" class="size-8 text-primary" />
          <div>
            <h1 class="text-xl font-semibold">
              Administración
            </h1>
            <p class="text-sm text-muted">
              Puestos, dispositivos y fallos de sincronización
            </p>
          </div>
        </div>
      </template>

      <UForm :state="{ nombreUsuario, pin }" class="flex flex-col gap-4" @submit="entrar">
        <UAlert
          v-if="avisoSesion && !error"
          color="warning"
          variant="soft"
          icon="i-lucide-clock"
          :title="avisoSesion"
        />

        <UFormField label="Usuario" required>
          <UInput
            v-model="nombreUsuario"
            placeholder="Usuario del super administrador"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            size="lg"
            class="w-full"
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
            class="w-full"
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
          :loading="enviando"
        >
          Entrar al panel
        </UButton>
      </UForm>

      <template #footer>
        <p class="text-center text-xs text-muted">
          Solo para la cuenta de administración.
          <NuxtLink to="/login" class="text-primary hover:underline">
            Ir a la app
          </NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
