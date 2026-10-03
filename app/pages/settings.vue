<script setup>
import { Capacitor } from '@capacitor/core'
import { getApiBaseUrl, setApiBaseUrl, serverAlcanzable } from '../utils/api'

const toast = useToast()
const conexion = useModoConexion()
const update = useAppUpdate()
const auth = useAuth()
// --- Permisos de recarga (solo Android) ---
// Configuración es el ÚNICO sitio donde se piden. No hay asistente al arrancar:
// la app no interrumpe a quien solo usa el quiosco, y quien sí quiere recargas
// tiene aquí el botón. Los tres estados (candado, SMS y notificaciones) llegan
// en una sola llamada a estado(), así que pintar la lista no pide nada.
//
// El estado vive en useSmsEtecsa para no duplicar consultas al plugin; aquí solo
// se reacciona y se ofrecen las acciones.
const sms = useSmsEtecsa()
const concediendo = ref('')

const sinCandado = computed(() => !sms.estado.value.restringido)
const permisoRecibir = computed(() => !!sms.estado.value.permisoRecibir)
const notificacionesOk = computed(() => !!sms.estado.value.notificaciones)

const permisosListos = computed(() => {
  return sinCandado.value && permisoRecibir.value && notificacionesOk.value
})

// La lista es puramente datos y las acciones se enlazan por clave desde la
// plantilla (ACCIONES_PERMISOS). Guardar funciones dentro del array obligaría a
// Vue a arrastrarlas al render, que es justo lo que reventaba antes.
const listaPermisos = computed(() => {
  return [
    {
      clave: 'restringidos',
      ok: sinCandado.value,
      texto: 'Ajustes restringidos desbloqueados',
      accion: 'Desbloquear'
    },
    {
      clave: 'sms',
      ok: permisoRecibir.value,
      texto: 'Lectura de SMS',
      accion: 'Conceder'
    },
    {
      clave: 'notificaciones',
      ok: notificacionesOk.value,
      texto: 'Avisos de recarga',
      accion: 'Activar'
    }
  ]
})

const ACCIONES_PERMISOS = {
  restringidos: () => sms.abrirAjustesPermisos('restringidos'),
  sms: () => sms.pedirPermiso(),
  notificaciones: () => sms.pedirPermisoNotificaciones()
}

async function ejecutarPermiso(clave) {
  if (concediendo.value) return
  concediendo.value = clave
  try {
    await ACCIONES_PERMISOS[clave]?.()
  } catch {
    // Si el plugin falla, la lista se repinta con el estado real y ya se ve
    // que el permiso sigue sin conceder. No hace falta un toast de error.
  } finally {
    concediendo.value = ''
    await sms.refrescarEstado()
  }
}

// El paso del candado solo se resuelve FUERA de la app, en Ajustes del sistema.
// Al volver hay que volver a preguntar, o la lista seguiría pidiendo
// "Desbloquear" a alguien que ya lo desbloqueó.
function alVolverDeAjustes() {
  if (esNativo.value && !document.hidden) sms.refrescarEstado()
}

onMounted(() => {
  if (!esNativo.value) return
  sms.refrescarEstado()
  document.addEventListener('visibilitychange', alVolverDeAjustes)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', alVolverDeAjustes)
})

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
  {
    label: 'Automática',
    description: 'Intenta en la app y, si falla, usa el navegador.',
    value: 'automatico'
  },
  {
    label: 'Solo navegador',
    description: 'Abre la descarga en el navegador del sistema.',
    value: 'navegador'
  },
  {
    label: 'En la app',
    description: 'Descarga aquí y abre el instalador. La primera vez pide permiso.',
    value: 'interno'
  }
]

const metodoActual = computed(() => metodoItems.find(i => i.value === update.metodo.value)?.label || 'Automática')

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

        <UFormField
          label="Descarga de actualizaciones"
          :help="`Método actual: ${metodoActual}. Automática intenta en la app y, si falla, usa el navegador.`"
        >
          <!-- OJO: `update` es un objeto PLANO de refs (lo devuelve useAppUpdate), no un
             reactive(), así que en la plantilla hay que leer `.value` a mano.
             Con `v-model="update.metodo"` el USelect recibía el objeto Ref en
             vez de su valor, y el recorrido que Nuxt UI hace sobre las props
             (ohash `diff`, que no detecta ciclos) se lo comía entero:
             ref -> dep -> Map de dependencias -> más refs -> nodos del DOM, hasta
             reventar con "Cannot serialize HTMLDivElement". -->
          <USelect
            :model-value="update.metodo.value"
            :items="metodoItems"
            class="w-full"
            size="lg"
            :ui="{ content: 'min-w-72' }"
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

    <!-- Permisos del módulo de Recargas. Es el único sitio donde se piden:
         no hay asistente al arrancar. Cada fila dice si algo falta y ofrece
         el botón que lo resuelve. -->
    <UCard v-if="esNativo">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium">
            Permisos de recarga
          </h2>
          <UButton
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Actualizar estado"
            @click="sms.refrescarEstado()"
          />
        </div>

        <p class="text-xs text-muted">
          Necesarios para anotar las recargas de Etecsa solas, con la app cerrada.
          Sin ellos puedes ver los SMS manualmente.
        </p>

        <ul class="space-y-2">
          <li
            v-for="p in listaPermisos"
            :key="p.clave"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <div class="flex items-center gap-2 min-w-0">
              <UIcon
                :name="p.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-alert'"
                class="size-4 shrink-0"
                :class="p.ok ? 'text-success' : 'text-warning'"
              />
              <span :class="p.ok ? '' : 'font-medium'">{{ p.texto }}</span>
            </div>
            <UButton
              v-if="!p.ok"
              size="xs"
              color="neutral"
              variant="outline"
              :label="p.accion"
              :loading="concediendo === p.clave"
              :disabled="!!concediendo"
              @click="ejecutarPermiso(p.clave)"
            />
          </li>
        </ul>

        <p
          v-if="permisosListos"
          class="text-xs text-muted"
        >
          Las recargas se anotan solas. En
          <NuxtLink
            to="/recargas/sms"
            class="underline"
          >SMS de recarga</NuxtLink>
          puedes ver los mensajes tal cual llegan.
        </p>
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
