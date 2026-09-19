<script setup>
import { $api, getApiBaseUrl, setApiBaseUrl, serverAlcanzable } from '../utils/api'

const toast = useToast()
const conexion = useModoConexion()
const update = useAppUpdate()

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
  if (update.estado.value === 'idle') {
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
    await $api('/api/health')
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

    <UCard v-if="!cargando">
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

    <UCard>
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

    <UCard>
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
