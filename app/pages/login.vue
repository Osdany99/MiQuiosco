<script setup>
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

definePageMeta({
  layout: 'auth'
})

const PREF_WEBAUTHN_ULTIMO_USUARIO = 'webauthn_ultimo_usuario'

const auth = useAuth()
const route = useRoute()
const toast = useToast()

const nombreUsuario = ref('')
const pin = ref('')
const error = ref(null)

// --- Modos de entrada ---
// Nativo con biometría: tabs Huella (plugin) / Normal.
// Web con autenticador de plataforma: tabs Huella (WebAuthn, online) / Normal.
// Sin biometría: login clásico de siempre.
const esNativo = computed(() => Capacitor.isNativePlatform())
const biometriaSoportada = ref(false)
const webAuthnSoportada = ref(false)
const huellaEnrolled = ref(false)
const huellaUsuario = ref(null)
const nombreHuellaWeb = ref('')
const tab = ref('normal')
const cargandoHuella = ref(false)

onMounted(async () => {
  if (esNativo.value) {
    try {
      biometriaSoportada.value = await auth.biometricoDisponible()
      if (!biometriaSoportada.value) return
      huellaEnrolled.value = await auth.biometricoHabilitado()
      if (huellaEnrolled.value) {
        huellaUsuario.value = await auth.biometricoUsuario()
        tab.value = 'huella'
      }
    } catch {
      biometriaSoportada.value = false
    }
    return
  }
  try {
    webAuthnSoportada.value = await auth.webAuthnDisponible()
    if (webAuthnSoportada.value) {
      const { value } = await Preferences.get({ key: PREF_WEBAUTHN_ULTIMO_USUARIO })
      if (value) {
        nombreHuellaWeb.value = value
        tab.value = 'huella'
      }
    }
  } catch {
    webAuthnSoportada.value = false
  }
})

const tabsItems = [
  { label: 'Huella', value: 'huella', icon: 'i-lucide-fingerprint' },
  { label: 'Usuario y PIN', value: 'normal', icon: 'i-lucide-user' }
]

const mostrarTabs = computed(
  () => (esNativo.value && biometriaSoportada.value) || (!esNativo.value && webAuthnSoportada.value)
)

onMounted(async () => {
  if (!esNativo.value) return
  try {
    biometriaSoportada.value = await auth.biometricoDisponible()
    if (!biometriaSoportada.value) return
    huellaEnrolled.value = await auth.biometricoHabilitado()
    if (huellaEnrolled.value) {
      huellaUsuario.value = await auth.biometricoUsuario()
      tab.value = 'huella'
    }
  } catch {
    biometriaSoportada.value = false
  }
})

async function irAlDestino(response) {
  if (!response?.usuario) return
  const destino = route.query.redirect
  if (destino) {
    await navigateTo(destino)
    return
  }
  await navigateTo('/cuadre')
}

function forzarModoNormal(mensaje) {
  tab.value = 'normal'
  if (mensaje) error.value = mensaje
}

async function entrarConHuella() {
  error.value = null
  cargandoHuella.value = true
  try {
    if (!esNativo.value) {
      await entrarConHuellaWeb()
      return
    }
    const resultado = await auth.loginConHuella()
    if (resultado?.cancelado) return
    if (resultado?.ok) await irAlDestino(resultado.response)
  } catch (err) {
    const msg = err?.message || 'No se pudo entrar con huella.'
    // 3 fallos, bloqueo del SO o PIN caducado: al modo normal con aviso.
    if (auth.intentosBiometricosFallidos.value >= 3 || /bloqueada|Demasiados intentos|ya no es válido/i.test(msg)) {
      if (/ya no es válido/i.test(msg)) huellaEnrolled.value = false
      forzarModoNormal(msg === 'El PIN guardado ya no es válido. Usa tu usuario y PIN para actualizarlo.'
        ? msg
        : 'Usa tu usuario y PIN.')
      if (/bloqueada/i.test(msg)) error.value = msg
    } else {
      error.value = msg
    }
  } finally {
    cargandoHuella.value = false
  }
}

async function entrarConHuellaWeb() {
  const nombre = nombreHuellaWeb.value.trim()
  if (!nombre) {
    error.value = 'Ingresa tu nombre de usuario.'
    return
  }
  try {
    const resultado = await auth.loginConWebauthn(nombre)
    await Preferences.set({ key: PREF_WEBAUTHN_ULTIMO_USUARIO, value: nombre })
    if (resultado?.ok) await irAlDestino(resultado.response)
  } catch (err) {
    const msg = err?.data?.statusMessage || err?.statusMessage || err?.message || ''
    if (/Credenciales inválidas/i.test(msg)) {
      forzarModoNormal('Ese usuario no tiene huella en este navegador. Usa tu usuario y PIN.')
    } else if (err?.name === 'NotAllowedError') {
      error.value = 'Operación cancelada.'
    } else {
      // Sin red u otro fallo: la huella web requiere conexión.
      error.value = msg || 'La huella web requiere conexión. Usa tu usuario y PIN.'
    }
  }
}

async function quitarHuella() {
  await auth.deshabilitarBiometrico()
  huellaEnrolled.value = false
  huellaUsuario.value = null
  tab.value = 'normal'
}

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

    // Auto-activar la huella tras el primer login manual (solo nativo con
    // biometría y si aún no estaba activa). El consentimiento queda en el
    // prompt del sistema + "Quitar huella" siempre visible.
    if (esNativo.value && biometriaSoportada.value && !huellaEnrolled.value) {
      try {
        await auth.habilitarBiometrico(nombreUsuario.value.trim(), pin.value)
        huellaEnrolled.value = true
        huellaUsuario.value = nombreUsuario.value.trim()
        toast.add({ title: 'Huella activada', description: 'La próxima vez podrás entrar con tu huella.', icon: 'i-lucide-fingerprint', color: 'success' })
      } catch {
        // La huella es opcional: un fallo aquí no bloquea el login.
      }
    }

    // En web se recuerda el último usuario para pre-rellenar el tab de huella.
    if (!esNativo.value) {
      await Preferences.set({ key: PREF_WEBAUTHN_ULTIMO_USUARIO, value: nombreUsuario.value.trim() }).catch(() => {})
    }

    await irAlDestino(response)
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

      <UTabs
        v-if="mostrarTabs"
        v-model="tab"
        :items="tabsItems"
        variant="pill"
        class="mb-5"
      />

      <!-- Modo huella -->
      <div v-if="mostrarTabs && tab === 'huella'" class="flex flex-col items-center gap-4 py-2">
        <!-- Web (WebAuthn): pide el usuario, la huella la pone el navegador -->
        <template v-if="!esNativo">
          <UFormField label="Usuario" required class="w-full">
            <UInput
              v-model="nombreHuellaWeb"
              placeholder="Ej. jefe"
              autocomplete="username"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UButton
            block
            size="md"
            icon="i-lucide-fingerprint"
            :loading="cargandoHuella"
            @click="entrarConHuella"
          >
            Entrar con huella
          </UButton>
          <p class="text-xs text-muted text-center">
            Requiere conexión y haber activado la huella en este navegador (Ajustes).
          </p>
          <UAlert
            v-if="error"
            color="error"
            icon="i-lucide-alert-circle"
            :title="error"
          />
        </template>
        <template v-else-if="huellaEnrolled">
          <UButton
            icon="i-lucide-fingerprint"
            size="xl"
            color="primary"
            variant="soft"
            square
            :loading="cargandoHuella"
            class="rounded-full size-20 [&_span]:size-10"
            aria-label="Entrar con huella"
            @click="entrarConHuella"
          />
          <div class="text-center">
            <p class="font-medium">
              {{ huellaUsuario || 'Mi cuenta' }}
            </p>
            <p class="text-sm text-muted">
              Toca la huella para entrar
            </p>
          </div>
          <UAlert
            v-if="error"
            color="error"
            icon="i-lucide-alert-circle"
            :title="error"
          />
          <button
            type="button"
            class="text-xs text-muted hover:underline"
            @click="quitarHuella"
          >
            Quitar huella de este dispositivo
          </button>
        </template>
        <template v-else>
          <UIcon name="i-lucide-fingerprint" class="size-12 text-muted" />
          <p class="text-sm text-muted text-center">
            Entra una vez con tu usuario y PIN y la huella quedará activada
            para la próxima vez.
          </p>
          <UButton color="neutral" variant="outline" @click="tab = 'normal'">
            Ir al login con PIN
          </UButton>
        </template>
      </div>

      <!-- Modo normal (o único modo en web / sin biometría) -->
      <UForm
        v-if="!mostrarTabs || tab === 'normal'"
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

    <p v-if="!esNativo" class="mt-4 text-center text-sm text-muted">
      ¿Usas Android?
      <NuxtLink to="/descargar" class="text-primary hover:underline">
        Descarga la app
      </NuxtLink>
    </p>
  </div>
</template>
