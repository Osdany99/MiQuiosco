<script setup>
import { $api, getApiBaseUrl, setApiBaseUrl, serverAlcanzable } from '../utils/api'

const toast = useToast()
const conexion = useModoConexion()

const serverUrl = ref('')
const cargando = ref(true)
const probando = ref(false)
const estadoPrueba = ref(null) // null | 'ok' | 'error'
const mensajePrueba = ref('')

onMounted(async () => {
  const url = await getApiBaseUrl()
  serverUrl.value = url || ''
  cargando.value = false
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
  toast.add({
    title: 'URL del servidor actualizada',
    description: url ? `Apuntando a ${url}` : 'Usando modo relativo (solo navegador)',
    color: 'success'
  })
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
      <div class="space-y-3">
        <h2 class="text-sm font-medium">
          Estado de conexión
        </h2>
        <div class="flex items-center gap-2 text-sm">
          <span
            class="size-2 rounded-full"
            :class="serverAlcanzable.value ? 'bg-green-500' : 'bg-red-500'"
          />
          <span>{{ serverAlcanzable.value ? 'Servidor accesible' : 'Servidor no responde' }}</span>
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
