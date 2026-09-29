<script setup>
import { Capacitor } from '@capacitor/core'
import { getApiBaseUrl, setApiBaseUrl, serverAlcanzable } from '../utils/api'

const toast = useToast()
const conexion = useModoConexion()
const update = useAppUpdate()
const auth = useAuth()

// La URL del servidor y las actualizaciones in-app solo aplican en Android:
// en web el navegador ya habla con su mismo origen.
const esNativo = computed(() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})

const serverUrl = ref('')
const cargando = ref(true)
const probando = ref(false)
const estadoPrueba = ref(null) // null | 'ok' | 'error'
const mensajePrueba = ref('')
const comprobandoUpdates = ref(false)

const metodoItems = [
  { label: 'Automática (recomendada)', value: 'automatico' },
  { label: 'Solo navegador', value: 'navegador' },
  { label: 'En la app (próximamente)', value: 'interno' }
]

const versionTexto = computed(() => {
  if (update.versionInstalada.value == null) return 'No disponible en web'
  const nombre = update.versionInstaladaNombre.value ? `v${update.versionInstaladaNombre.value} ` : ''
  return `${nombre}(código ${update.versionInstalada.value})`
})

onMounted(async () => {
  const url = await getApiBaseUrl()
  serverUrl.value = url || ''
  cargando.value = false
  if (esNativo.value && update.estado.value === 'idle') {
    update.comprobar().catch(() => {})
  }
})

async function probarConexion() {
  probando.value = true
  estadoPrueba.value = null
  mensajePrueba.value = ''

  const base = serverUrl.value.replace(/\/+$/, '')
  if (!base) {
    estadoPrueba.value = 'error'
    mensajePrueba.value = 'Ingresa una URL de servidor primero.'
    probando.value = false
    return
  }

  try {
    // Se prueba la URL escrita, no la base actual.
    await $fetch(`${base}/api/health`)
    estadoPrueba.value = 'ok'
    mensajePrueba.value = 'Servidor alcanzado correctamente.'
  } catch {
    estadoPrueba.value = 'error'
    mensajePrueba.value = 'No se pudo conectar al servidor. Verifica la URL y que el servidor esté encendido.'
  } finally {
    probando.value = false
  }
}

async function guardar() {
  const url = serverUrl.value.trim()
  await setApiBaseUrl(url || '')
}

async function comprobarUpdates() {
  comprobandoUpdates.value = true
  try {
    const resultado = await update.comprobar()
    // 'opcional' y 'obligatoria' muestran su propia UI automáticamente.
    // 'actualizada' sí necesita aviso: sin red el chequeo también devuelve
    // 'actualizada', así que el silencio sería indistinguible del éxito.
    if (resultado === 'actualizada') {
      toast.add({
        title: 'Estás al día',
        description: 'No hay actualizaciones disponibles.',
        color: 'info'
      })
    }
  } finally {
    comprobandoUpdates.value = false
  }
}

// --- Huella en este navegador (WebAuthn, solo web) ---
const webAuthnSoportada = ref(false)
const whUsuario = ref('')
const whPin = ref('')
const whDispositivos = ref([])
const whCargando = ref(false)
const whActivando = ref(false)
const whError = ref(null)

onMounted(async () => {
  if (!esNativo.value) {
    try {
      webAuthnSoportada.value = await auth.webAuthnDisponible()
    } catch {
      webAuthnSoportada.value = false
    }
  }
})

async function whCargarDispositivos() {
  whError.value = null
  if (!whUsuario.value.trim() || !whPin.value) {
    whError.value = 'Ingresa tu usuario y PIN para ver tus dispositivos.'
    return
  }
  whCargando.value = true
  try {
    whDispositivos.value = await auth.listarWebauthn(whUsuario.value.trim(), whPin.value)
  } catch (err) {
    whError.value = err?.data?.statusMessage || err?.message || 'No se pudieron cargar los dispositivos.'
  } finally {
    whCargando.value = false
  }
}

async function whActivar() {
  whError.value = null
  if (!whUsuario.value.trim() || !whPin.value) {
    whError.value = 'Ingresa tu usuario y PIN para activar la huella.'
    return
  }
  whActivando.value = true
  try {
    const nombreDispositivo = `${navigator.platform || 'Navegador'} · ${new Date().toLocaleDateString()}`.slice(0, 100)
    await auth.registrarWebauthn(whUsuario.value.trim(), whPin.value, nombreDispositivo)
    toast.add({ title: 'Huella activada', description: 'Este navegador ya puede entrar con huella.', icon: 'i-lucide-fingerprint', color: 'success' })
    await whCargarDispositivos()
  } catch (err) {
    whError.value = err?.data?.statusMessage || err?.message || 'No se pudo activar la huella.'
  } finally {
    whActivando.value = false
  }
}

async function whBorrar(credentialId) {
  whError.value = null
  try {
    await auth.borrarWebauthn(whUsuario.value.trim(), whPin.value, credentialId)
    toast.add({ title: 'Dispositivo olvidado', color: 'success' })
    await whCargarDispositivos()
  } catch (err) {
    whError.value = err?.data?.statusMessage || err?.message || 'No se pudo olvidar el dispositivo.'
  }
}

async function whOlvidarEste() {
  whError.value = null
  if (!whUsuario.value.trim() || !whPin.value) {
    whError.value = 'Ingresa tu usuario y PIN para continuar.'
    return
  }
  try {
    await auth.olvidarEsteNavegadorWebauthn(whUsuario.value.trim(), whPin.value)
    toast.add({ title: 'Este navegador ya no usa huella', color: 'success' })
    await whCargarDispositivos()
  } catch (err) {
    whError.value = err?.data?.statusMessage || err?.message || 'No se pudo completar.'
  }
}
</script>

<template>
  <div class="max-w-lg mx-auto space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">
        Configuración
      </h1>
      <p class="text-sm text-muted">
        URL del servidor para sincronización
      </p>
    </div>

    <UCard v-if="!cargando && esNativo">
      <div class="space-y-4">
        <UFormField label="URL del servidor" help="Ej: http://192.168.1.100:3000">
          <UInput
            v-model="serverUrl"
            placeholder="http://192.168.1.100:3000"
            size="lg"
          />
        </UFormField>

        <div class="flex items-center gap-3">
          <UButton
            :loading="probando"
            color="neutral"
            variant="outline"
            @click="probarConexion"
          >
            Probar conexión
          </UButton>

          <UButton @click="guardar">
            Guardar
          </UButton>
        </div>

        <UAlert
          v-if="estadoPrueba === 'ok'"
          color="success"
          icon="i-lucide-check-circle"
          :title="mensajePrueba"
        />

        <UAlert
          v-if="estadoPrueba === 'error'"
          color="error"
          icon="i-lucide-alert-circle"
          :title="mensajePrueba"
        />
      </div>
    </UCard>

    <UCard v-if="esNativo">
      <div class="space-y-4">
        <div>
          <h2 class="text-sm font-medium">
            Aplicación
          </h2>
          <p class="text-sm text-muted">
            Versión instalada: {{ versionTexto }}
          </p>
        </div>

        <UFormField label="Descarga de actualizaciones" help="Automática intenta en la app y si falla usa el navegador.">
          <USelect
            v-model="update.metodo"
            :items="metodoItems"
            @update:model-value="update.guardarMetodo"
          />
        </UFormField>

        <UButton
          :loading="comprobandoUpdates"
          color="neutral"
          variant="outline"
          @click="comprobarUpdates"
        >
          Comprobar actualizaciones
        </UButton>
      </div>
    </UCard>

    <UCard v-if="!esNativo && webAuthnSoportada">
      <div class="space-y-4">
        <div>
          <h2 class="text-sm font-medium">
            Huella en este navegador
          </h2>
          <p class="text-sm text-muted">
            Entra con tu huella sin escribir el PIN. Requiere conexión.
          </p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Usuario">
            <UInput v-model="whUsuario" placeholder="Ej. jefe" autocomplete="username" />
          </UFormField>
          <UFormField label="PIN">
            <UInput
              v-model="whPin"
              type="password"
              inputmode="numeric"
              maxlength="6"
              autocomplete="current-password"
            />
          </UFormField>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton :loading="whActivando" icon="i-lucide-fingerprint" @click="whActivar">
            Activar huella aquí
          </UButton>
          <UButton
            :loading="whCargando"
            color="neutral"
            variant="outline"
            @click="whCargarDispositivos"
          >
            Ver mis dispositivos
          </UButton>
        </div>

        <UAlert
          v-if="whError"
          color="error"
          icon="i-lucide-alert-circle"
          :title="whError"
        />

        <ul v-if="whDispositivos.length" class="divide-y divide-default rounded-lg border border-default">
          <li v-for="d in whDispositivos" :key="d.credentialId" class="flex items-center justify-between gap-3 px-3 py-2">
            <div class="min-w-0">
              <p class="text-sm font-medium truncate">
                {{ d.nombreDispositivo || 'Navegador' }}
              </p>
              <p class="text-xs text-muted">
                {{ d.creadoEn ? new Date(d.creadoEn).toLocaleString() : '' }}
              </p>
            </div>
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash-2"
              aria-label="Olvidar dispositivo"
              @click="whBorrar(d.credentialId)"
            />
          </li>
        </ul>

        <button
          v-if="whDispositivos.length"
          type="button"
          class="text-xs text-muted hover:underline"
          @click="whOlvidarEste"
        >
          Olvidar este navegador
        </button>
      </div>
    </UCard>

    <UCard v-if="!esNativo">
      <div class="space-y-4">
        <div>
          <h2 class="text-sm font-medium">
            App Android
          </h2>
          <p class="text-sm text-muted">
            Usa la aplicación en tu teléfono para trabajar sin conexión.
          </p>
        </div>

        <UButton
          to="/descargar"
          icon="i-lucide-download"
          color="neutral"
          variant="outline"
        >
          Descargar APK
        </UButton>
      </div>
    </UCard>

    <UCard v-if="esNativo">
      <div class="space-y-3">
        <h2 class="text-sm font-medium">
          Estado de conexión
        </h2>        <div class="flex items-center gap-2 text-sm">
          <span
            class="size-2 rounded-full"
            :class="serverAlcanzable ? 'bg-green-500' : 'bg-red-500'"
          />
          <span>{{ serverAlcanzable ? 'Servidor accesible' : 'Servidor no responde' }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <UIcon
            :name="conexion.modo.value === 'online' ? 'i-lucide-globe' : 'i-lucide-database'"
            class="size-4"
          />
          <span>Modo: {{ conexion.modo.value === 'online' ? 'Online' : 'Local' }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>
