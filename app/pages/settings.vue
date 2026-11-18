<script setup>
import { Capacitor } from '@capacitor/core'
import { getApiBaseUrl, setApiBaseUrl, serverAlcanzable } from '../utils/api'
import { contactosEstado, contactosPedirPermiso } from '../utils/contactos'
import { crearCopiaBd, formatearBytes, elegirCopiaParaRestaurar, restaurarCopiaBd } from '../utils/backupBd'
import { fijarTelemetria, telemetriaActivaSync } from '../utils/voice/telemetria'
import { IDIOMAS_FLOTA, MOTORES_FLOTA } from '#shared/voz/config'
import { useVozServicio } from '../composables/useVozServicio'

const toast = useToast()
const conexion = useModoConexion()
const tts = useTts()
const voz = useVoiceCommand()
const vozConfig = useVozConfig()
const servicioVoz = useVozServicio()
const aliasVoz = useVozAlias()
const inventarioAlias = useInventario()
const aliasAbierto = ref(false)
const productosAlias = ref([])

/** Nombres de producto para la lista de alias (se cargan al abrir). */
const nombreProductoAlias = productoId =>
  productosAlias.value.find(p => (p.productoId ?? p.id) === productoId)?.nombre ?? 'Producto'

async function cargarAlias() {
  await aliasVoz.cargar().catch(() => {})
  if (!productosAlias.value.length) {
    productosAlias.value = (await inventarioAlias.cargarSaldos().catch(() => [])) ?? []
  }
}

watch(aliasAbierto, (abierto) => {
  if (abierto) void cargarAlias()
})
const update = useAppUpdate()
const auth = useAuth()
const { validarSincronizacion, hayRed } = useSync()
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
/** Estado del permiso de Contactos, que vive en su propio plugin. */
const contactos = ref({ disponible: false, permiso: false, restringido: false })

const sinCandado = computed(() => !sms.estado.value.restringido)
const permisoRecibir = computed(() => !!sms.estado.value.permisoRecibir)
const notificacionesOk = computed(() => !!sms.estado.value.notificaciones)
const permisoContactos = computed(() => !!contactos.value.permiso)
const permisoMicrofono = computed(() => !!voz.permisoMicrofono.value)

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
    },
    {
      clave: 'contactos',
      ok: permisoContactos.value,
      texto: 'Contactos del teléfono (opcional)',
      accion: 'Conceder'
    },
    {
      clave: 'microfono',
      ok: permisoMicrofono.value,
      texto: 'Reconocimiento de voz (micrófono)',
      accion: 'Conceder'
    }
  ]
})

const ACCIONES_PERMISOS = {
  restringidos: () => sms.abrirAjustesPermisos('restringidos'),
  sms: () => sms.pedirPermiso(),
  notificaciones: () => sms.pedirPermisoNotificaciones(),
  contactos: () => pedirPermisoContactos(),
  microfono: () => voz.pedirPermisoMicrofono()
}

/** Pide READ_CONTACTS y vuelve a pintar la lista con el estado real. */
async function pedirPermisoContactos() {
  const res = await contactosPedirPermiso()
  contactos.value = await contactosEstado()
  if (!res.permiso && contactos.value.restringido) {
    toast.add({
      title: 'Permiso bloqueado por Android',
      description: 'Activa antes "Permitir ajustes restringidos" en Ajustes del sistema; si no, el permiso aparece gris.',
      color: 'warning'
    })
  }
  return res
}

/** Repinta la lista entera de permisos (SMS y contactos). */
async function refrescarPermisos() {
  await sms.refrescarEstado()
  contactos.value = await contactosEstado()
  await voz.check()
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
    await refrescarPermisos()
  }
}

// La URL del servidor y las actualizaciones in-app solo aplican en Android:
// en web el navegador ya habla con su mismo origen.
const esNativo = computed(() => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
})

// El paso del candado solo se resuelve FUERA de la app, en Ajustes del sistema.
// Al volver hay que volver a preguntar, o la lista seguiría pidiendo
// "Desbloquear" a alguien que ya lo desbloqueó.
function alVolverDeAjustes() {
  if (esNativo.value && !document.hidden) refrescarPermisos()
}

onMounted(() => {
  if (!esNativo.value) return
  refrescarPermisos()
  document.addEventListener('visibilitychange', alVolverDeAjustes)
})
onMounted(() => {
  void voz.check()
  void voz.refrescarTraza()
  void voz.sincronizarDiagNativo()
  void servicioVoz.refrescar()
  void vozConfig.cargar().then(() => vozConfig.refrescar()).catch(() => {})
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', alVolverDeAjustes)
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

// --- Copia de seguridad de la base local ---
// La copia va a la carpeta Descargas del propio teléfono (no al servidor): el
// jefe la envía luego a donde quiera, p. ej. WhatsApp, sin depender de que la
// sincronización haya funcionado.
const guardandoCopia = ref(false)
const resultadoCopia = ref(null) // null | { ruta, bytes }
const errorCopia = ref('')

async function crearCopia() {
  if (guardandoCopia.value) return
  guardandoCopia.value = true
  resultadoCopia.value = null
  errorCopia.value = ''
  try {
    const res = await crearCopiaBd()
    if (res) {
      resultadoCopia.value = res
      toast.add({
        title: 'Copia guardada en Descargas',
        description: `${res.ruta} (${formatearBytes(res.bytes)})`,
        icon: 'i-lucide-circle-check',
        color: 'success'
      })
    }
  } catch (err) {
    errorCopia.value = err?.message || 'No se pudo crear la copia de seguridad.'
  } finally {
    guardandoCopia.value = false
  }
}

// --- Restaurar una copia ---
// Son dos pasos a propósito: elegir el archivo NO toca la base (el plugin solo
// lo valida y lo deja en caché), y el jefe ve un resumen de lo que contiene
// antes de confirmar. En Descargas suele haber varias copias y ninguna se llama
// igual, así que el resumen es lo que evita restaurar la equivocada.
// Tras restaurar, la base se recarga: la conexión quedó cerrada a propósito.
const eligiendoCopia = ref(false)
const restaurando = ref(false)
const dialogoRestaurar = ref(false)
const copiaElegida = ref(null)
const errorRestaurar = ref('')
const validandoSync = ref(false)

async function prepararRestauracion() {
  if (eligiendoCopia.value || restaurando.value) return
  eligiendoCopia.value = true
  errorRestaurar.value = ''
  copiaElegida.value = null
  try {
    const res = await elegirCopiaParaRestaurar()
    if (!res) {
      errorRestaurar.value = 'La restauración solo está disponible en Android.'
    } else if (!res.cancelado) {
      copiaElegida.value = res
      dialogoRestaurar.value = true
    }
  } catch (err) {
    errorRestaurar.value = err?.message || 'No se pudo leer el archivo elegido.'
  } finally {
    eligiendoCopia.value = false
  }
}

async function confirmarRestauracion() {
  if (restaurando.value) return
  restaurando.value = true
  errorRestaurar.value = ''
  try {
    const res = await restaurarCopiaBd()
    if (res) {
      dialogoRestaurar.value = false
      toast.add({
        title: 'Base restaurada',
        description: `Vuelvo a cargar la app. La copia anterior quedó en ${res.respaldo}.`,
        icon: 'i-lucide-circle-check',
        color: 'success',
        duration: 6000
      })
      // La conexión quedó cerrada al sustituir el archivo. Recargar es lo que
      // la reabre y aplica las migraciones que le falten a la copia.
      setTimeout(() => window.location.reload(), 1200)
    }
  } catch (err) {
    errorRestaurar.value = err?.message || 'No se pudo restaurar la base.'
    dialogoRestaurar.value = false
  } finally {
    restaurando.value = false
  }
}

async function validarSincronizacionManual() {
  if (validandoSync.value) return
  validandoSync.value = true
  try {
    const ok = await validarSincronizacion(false)
    toast.add({
      title: ok ? 'Sincronización validada' : 'Validación con incidencias',
      description: ok
        ? 'La base local quedó reconciliada con el servidor.'
        : 'Revisa el log de sync; se reintentará automáticamente.',
      color: ok ? 'success' : 'warning'
    })
  } catch (err) {
    toast.add({
      title: 'Error',
      description: err?.message || 'No se pudo validar la sincronización.',
      color: 'error'
    })
  } finally {
    validandoSync.value = false
  }
}

const ttsActivo = computed({
  get: () => tts.habilitado.value,
  set: (value) => { void tts.setHabilitado(value) }
})
// Motor, idioma, traza y frases de prueba son herramientas de soporte: el jefe
// no necesita verlas y un cambio accidental puede romper el reconocimiento.
const esSuperAdmin = computed(() => auth.usuarioActual.value?.rol === 'super_admin')
const avanzadoAbierto = ref(false)
const flotaMotor = computed(() =>
  MOTORES_FLOTA.find(o => o.id === vozConfig.config.value.motor)?.label
  ?? vozConfig.config.value.motor
)
const flotaIdioma = computed(() =>
  IDIOMAS_FLOTA.find(o => o.id === vozConfig.config.value.idioma)?.label
  ?? vozConfig.config.value.idioma
)

async function descargarConfigVoz() {
  await vozConfig.refrescar()
  await vozConfig.aplicarAhora().catch(() => {})
  toast.add({
    title: 'Configuración de voz',
    description: vozConfig.error.value
      ? vozConfig.error.value
      : `Aplicada la versión ${vozConfig.version.value || 'local'}.`,
    color: vozConfig.error.value ? 'warning' : 'success'
  })
}
const telemetriaValor = ref(telemetriaActivaSync())
const telemetriaActivaComputed = computed({
  get: () => telemetriaValor.value,
  set: (value) => {
    telemetriaValor.value = value
    void fijarTelemetria(value)
  }
})

const itemsMotorVoz = computed(() =>
  (voz.opcionesMotor || []).map(opcion => ({ label: opcion.label, value: opcion.id }))
)
const itemsIdiomaVoz = computed(() =>
  (voz.opcionesIdioma || []).map(opcion => ({ label: opcion.label, value: opcion.id }))
)
const modoActualTexto = computed(() => voz.modoActual?.value === 'offline' ? 'offline' : 'online')
const avisoConexion = computed(() => {
  if (voz.hayInternet.value === null) return 'Comprobando conexión…'
  if (voz.hayInternet.value === true) return ''
  const pref = voz.preferenciaMotor.value
  if (pref === 'google') return 'Sin conexión: el modo “solo online” no puede reconocer.'
  if (pref === 'google-offline' || pref === 'vosk') return 'Sin conexión: este modo trabaja offline.'
  return 'Sin conexión: usará el modo offline.'
})

// En Android nativo, SpeechRecognizer funciona offline con paquetes de idioma
// instalados localmente.
const probandoTts = ref(false)
const itemsVocesTts = computed(() =>
  (tts.voces.value || []).map((v) => {
    const partes = [v.displayName || v.name || v.lang || '(sin nombre)']
    if (v.offline === true) partes.push('· offline')
    return { label: partes.join(' '), value: v.voiceURI }
  })
)

async function probarTts() {
  if (probandoTts.value) return
  probandoTts.value = true
  try {
    await tts.speak('Hola, esta es la voz de MiQuiosco.')
    toast.add({ title: 'Voz de prueba reproducida', color: 'success' })
  } catch (e) {
    toast.add({ title: 'No se pudo reproducir la voz', description: e?.message, color: 'error' })
  } finally {
    probandoTts.value = false
  }
}

/** Limpia la traza y marca el inicio de una ronda (online u offline). */
async function prepararRonda() {
  await voz.iniciarTraza({ modo: conexion.modo.value, red: hayRed.value })
  toast.add({
    title: hayRed.value ? 'Ronda ONLINE preparada' : 'Ronda OFFLINE preparada',
    description: 'La traza se graba siempre. Prueba ahora las frases de la lista.',
    color: 'success'
  })
}

async function copiarTraza() {
  // Recupera lo que el plugin guardó por su cuenta y lo persistido antes de copiar.
  await voz.sincronizarDiagNativo()
  await voz.refrescarTraza()
  const texto = voz.textoTraza.value
  if (!texto) {
    toast.add({ title: 'Todavía no hay registros', color: 'warning' })
    return
  }
  try {
    await navigator.clipboard.writeText(texto)
    toast.add({ title: 'Registro copiado', color: 'success' })
  } catch {
    toast.add({
      title: 'No se pudo copiar',
      description: 'Mantén pulsado el texto y elige Copiar.',
      color: 'warning'
    })
  }
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

    <!-- Solo el jefe toca la URL y el metodo de actualizacion: un trabajador
      que apunte la app a otro servidor (o cambie el metodo) rompe la
      sincronizacion del puesto sin que nadie lo note. -->
    <UAlert
      v-if="esNativo && !auth.esJefe"
      color="neutral"
      icon="i-lucide-info"
      title="Ajustes del puesto"
      description="La URL del servidor y las actualizaciones las configura el jefe."
    />

    <UCard v-if="!cargando && esNativo && auth.esJefe">
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

    <UCard v-if="esNativo && auth.esJefe">
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

    <UCard v-if="esNativo && auth.esJefe">
      <div class="space-y-4">
        <div>
          <h2 class="text-sm font-medium">
            Copia de seguridad
          </h2>
          <p class="text-sm text-muted">
            Guarda la base de datos local del teléfono en la carpeta Descargas.
          </p>
        </div>

        <p class="text-xs text-muted">
          Útil si no confías en que la sincronización con el servidor haya
          guardado todo. El archivo contiene los datos completos del quiosco
          (ventas, fiado, clientes); guárdalo en un sitio seguro.
        </p>

        <UButton
          :loading="guardandoCopia"
          icon="i-lucide-database-backup"
          @click="crearCopia"
        >
          Guardar copia en Descargas
        </UButton>

        <UButton
          :loading="eligiendoCopia"
          icon="i-lucide-database-backup"
          variant="soft"
          color="neutral"
          @click="prepararRestauracion"
        >
          Restaurar desde un archivo
        </UButton>

        <UButton
          :loading="validandoSync"
          icon="i-lucide-refresh-cw"
          variant="soft"
          color="primary"
          @click="validarSincronizacionManual"
        >
          Validar sincronización con el servidor
        </UButton>

        <UAlert
          v-if="resultadoCopia"
          color="success"
          icon="i-lucide-circle-check"
          :title="`Copia guardada: ${resultadoCopia.ruta}`"
          :description="`Tamaño: ${formatearBytes(resultadoCopia.bytes)}. Búscala en Descargas o envíala por WhatsApp.`"
        />

        <UAlert
          v-if="errorCopia"
          color="error"
          icon="i-lucide-circle-alert"
          :title="errorCopia"
        />

        <UAlert
          v-if="errorRestaurar"
          color="error"
          icon="i-lucide-circle-alert"
          :title="errorRestaurar"
        />

        <p class="text-xs text-muted">
          Restaurar reemplaza TODOS los datos del teléfono por los de la copia.
          Antes de tocar nada se guarda el estado actual en Descargas, y lo que
          no se hubiera sincronizado se pierde: esa copia es la vuelta atrás.
        </p>
      </div>
    </UCard>

    <BaseDialog
      v-model="dialogoRestaurar"
      title="Restaurar esta copia"
      description="Se reemplazarán los datos del teléfono por los del archivo elegido."
      confirm-text="Restaurar"
      confirm-color="error"
      :loading="restaurando"
      @cancel="dialogoRestaurar = false"
      @confirm="confirmarRestauracion"
    >
      <div v-if="copiaElegida" class="space-y-3 text-sm">
        <p>La copia contiene:</p>
        <ul class="space-y-1">
          <li>
            <span class="text-muted">Cuadres:</span>
            {{ copiaElegida.cuadres }}
            <template v-if="copiaElegida.desde">
              (del {{ copiaElegida.desde }} al {{ copiaElegida.hasta }})
            </template>
          </li>
          <li>
            <span class="text-muted">Productos:</span>
            {{ copiaElegida.productos }}
          </li>
          <li>
            <span class="text-muted">Movimientos de inventario:</span>
            {{ copiaElegida.movimientos }}
          </li>
          <li>
            <span class="text-muted">Tamaño:</span>
            {{ formatearBytes(copiaElegida.bytes) }}
          </li>
        </ul>
        <UAlert
          color="warning"
          icon="i-lucide-circle-alert"
          title="Se reemplaza todo"
          description="Ventas, cuadres, fiado, clientes y el inventario. La app se recarga al terminar, y antes se guarda en Descargas una copia de lo que hay ahora."
        />
      </div>
    </BaseDialog>

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

    <!-- Permisos del dispositivo. Es el único sitio donde se piden:
         no hay asistente al arrancar. Cada fila dice si algo falta y ofrece
         el botón que lo resuelve. -->
    <UCard v-if="esNativo">
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-sm font-medium">
            Permisos del dispositivo
          </h2>
          <UButton
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Actualizar estado"
            @click="refrescarPermisos()"
          />
        </div>

        <p class="text-xs text-muted">
          Necesarios para anotar las recargas de Etecsa solas, con la app cerrada.
          Sin ellos puedes ver los SMS manualmente. El de Contactos es
          opcional: solo hace falta para crear clientes desde la agenda.
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

        <p class="text-xs text-muted">
          Motor de voz (STT): {{ voz.disponible.value ? 'Disponible' : 'No disponible' }}
          <span v-if="voz.esNativo.value" class="text-muted">· En el dispositivo: {{ voz.onDeviceStt.value ? 'Sí' : 'No' }}</span>
        </p>
        <p v-if="esNativo" class="text-xs text-muted">
          Motor TTS: {{ tts.disponible.value ? 'Disponible' : 'No disponible' }}
          <span v-if="tts.nativoEngine.value">· {{ tts.nativoEngine.value }}</span>
          · {{ (tts.voces.value || []).length }} voces detectadas
        </p>

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

    <UCard>
      <div class="space-y-3">
        <div>
          <h2 class="text-sm font-medium">
            Voz
          </h2>
          <p class="text-sm text-muted">
            Cómo habla el dispositivo y cómo se confirma una venta dictada.
          </p>
          <UButton
            to="/ayuda/voz"
            variant="soft"
            color="neutral"
            icon="i-lucide-mic"
            label="¿Qué puedo decir? Ver los comandos"
            class="mt-3 w-full sm:w-auto"
          />
        </div>

        <USwitch
          v-model="ttsActivo"
          color="primary"
          :disabled="!tts.disponible.value"
          description="Lee lo que va a hacer y pide un “sí” antes de aplicarlo. Apagado, todo se confirma con el botón (las acciones sin formulario siempre preguntan)."
        >
          Confirmación por voz
        </USwitch>

        <p v-if="!tts.disponible.value" class="text-xs text-warning">
          Este dispositivo no tiene voz de respuesta instalada.
        </p>

        <div class="space-y-1 border-t border-default pt-3">
          <p class="text-sm">
            Con la confirmación por voz activa, la asistente dice lo que va a hacer y
            espera un “sí” (6 segundos) antes de aplicarlo.
          </p>
          <p v-if="!ttsActivo" class="text-xs text-warning">
            Apagada: la venta y los comandos con formulario se confirman con el botón.
            Las acciones sin formulario (mover un producto) siempre preguntan por voz.
          </p>
        </div>

        <!-- Voz de respuesta (TTS): SOLO afecta a cómo la app HABLA. -->
        <div class="space-y-2 border-t border-default pt-3">
          <h3 class="text-sm font-medium">
            Voz de respuesta
          </h3>
          <USelect
            :items="itemsVocesTts"
            :model-value="tts.vozUri.value"
            :disabled="!tts.disponible.value || tts.cargandoVoces.value || !itemsVocesTts.length"
            :placeholder="tts.cargandoVoces.value ? 'Cargando voces…' : (itemsVocesTts.length ? 'Seleccionar voz' : 'Sin voces disponibles')"
            class="w-full"
            @update:model-value="(value) => { void tts.setVoz(value) }"
          />
          <p v-if="!tts.cargandoVoces.value && !itemsVocesTts.length" class="text-xs text-warning">
            No hay voces instaladas. Instala español en el dispositivo.
          </p>
          <div class="flex items-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              icon="i-lucide-volume-2"
              :loading="probandoTts"
              :disabled="!tts.disponible.value || probandoTts"
              @click="probarTts"
            >
              Probar voz
            </UButton>
            <span class="text-xs text-muted">
              Reproduce una frase corta con la voz seleccionada.
            </span>
          </div>
        </div>

        <!-- Escucha con la app cerrada (solo Android). -->
        <div
          v-if="servicioVoz.esNativo && auth.esJefe"
          class="space-y-2 border-t border-default pt-3"
        >
          <h3 class="text-sm font-medium">
            Con la app cerrada
          </h3>
          <p class="text-xs text-muted">
            El interruptor de escucha está en
            <NuxtLink to="/pendientes" class="underline">Por revisar (voz)</NuxtLink>.
            Al dictar se muestra la onda del dock con lo que se va entendiendo.
          </p>
        </div>

        <!-- Alias de producto aprendidos: el jefe los enseña y los borra. -->
        <UCollapsible v-if="auth.esJefe.value" v-model:open="aliasAbierto" class="border-t border-default pt-3">
          <UButton
            variant="ghost"
            size="sm"
            icon="i-lucide-tags"
            :label="`Alias de productos (${aliasVoz.lista.value.length})`"
          />
          <template #content>
            <div class="space-y-2 pt-2">
              <p class="text-xs text-muted">
                Se aprenden cuando eliges un producto del menú o lo asignas en
                Por revisar. Solo mejoran el reconocimiento: nunca venden solos.
              </p>
              <p v-if="!aliasVoz.lista.value.length" class="text-xs text-muted">
                Todavía no hay alias.
              </p>
              <ul v-else class="divide-y divide-default rounded-lg border border-default">
                <li
                  v-for="a in aliasVoz.lista.value"
                  :key="a.id"
                  class="flex items-center justify-between gap-2 px-3 py-2"
                >
                  <span class="text-sm min-w-0 truncate">
                    «{{ a.texto }}» → {{ nombreProductoAlias(a.productoId) }}
                  </span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    label="Borrar"
                    @click="aliasVoz.deshacer(a.id)"
                  />
                </li>
              </ul>
            </div>
          </template>
        </UCollapsible>

        <!-- Herramientas de soporte: solo super_admin. -->
        <UCollapsible v-if="esSuperAdmin" v-model:open="avanzadoAbierto" class="border-t border-default pt-3">
          <UButton
            variant="ghost"
            size="sm"
            :icon="avanzadoAbierto ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            label="Avanzado (soporte)"
          />
          <template #content>
            <div class="space-y-3 pt-2">
              <div class="space-y-2 rounded-lg border border-default p-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <h3 class="text-sm font-medium">
                    Configuración de flota
                  </h3>
                  <UBadge color="neutral" variant="soft" size="sm">
                    {{ vozConfig.version.value ? `v${vozConfig.version.value}` : 'Sin sincronizar' }}
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  Palabra clave: «{{ vozConfig.config.value.wake }}» ·
                  {{ flotaMotor }} · {{ flotaIdioma }} ·
                  retención {{ vozConfig.config.value.retencionDias }} días.
                </p>
                <p class="text-xs text-muted">
                  Los cambios manuales de motor o idioma en este equipo se
                  respetan hasta el próximo cambio de flota o del propio equipo.
                </p>
                <div class="flex flex-wrap gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-refresh-cw"
                    :loading="vozConfig.cargando.value"
                    @click="descargarConfigVoz"
                  >
                    Descargar y aplicar
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-settings-2"
                    to="/admin/voz-configuracion"
                  >
                    Editar flota
                  </UButton>
                </div>
              </div>

              <div class="space-y-2">
                <h3 class="text-sm font-medium">
                  Motor de reconocimiento
                </h3>
                <p class="text-xs text-muted">
                  Cada modo hace un solo intento: online no cae a offline y
                  offline no cae a online.
                </p>
                <USelect
                  :items="itemsMotorVoz"
                  :model-value="voz.preferenciaMotor.value"
                  class="w-full"
                  @update:model-value="(value) => { void voz.guardarPreferenciaMotor(value) }"
                />
                <p class="text-xs text-muted">
                  Motor actual: {{ voz.nombreMotor.value ?? '—' }} · {{ modoActualTexto }}
                </p>
                <p v-if="avisoConexion" class="text-xs text-warning">
                  {{ avisoConexion }}
                </p>
              </div>

              <div class="space-y-2">
                <h3 class="text-sm font-medium">
                  Idioma del reconocimiento
                </h3>
                <USelect
                  :items="itemsIdiomaVoz"
                  :model-value="voz.preferenciaIdioma.value"
                  class="w-full"
                  @update:model-value="(value) => { void voz.guardarPreferenciaIdioma(value) }"
                />
                <p class="text-xs text-muted">
                  Sistema: {{ voz.idiomaSistema.value }} · Usando: {{ voz.idiomaEtiqueta.value }}
                </p>
              </div>

              <div class="space-y-1">
                <h3 class="text-sm font-medium">
                  Estado del reconocimiento
                </h3>
                <p class="text-xs text-muted">
                  Motor:
                  {{ voz.motorStt.value || (voz.esNativo.value ? 'No detectado' : 'Navegador') }}
                  <span v-if="voz.esNativo.value">· En el dispositivo: {{ voz.onDeviceStt.value ? 'Sí' : 'No' }}</span>
                  <span v-if="voz.esNativo.value">· Servicios: {{ voz.serviciosStt.value.length }}</span>
                </p>
              </div>

              <USwitch
                v-model="telemetriaActivaComputed"
                color="primary"
                description="Envía plantillas enmascaradas al panel /admin/voz para mejorar el léxico."
              >
                Enviar al administrador las frases no entendidas
              </USwitch>

              <!-- Diagnóstico local: se copia a mano, nunca se envía al servidor. -->
              <div class="space-y-2">
                <div class="flex items-center justify-between gap-2">
                  <h3 class="text-sm font-medium">
                    Diagnóstico de voz
                  </h3>
                  <UBadge color="success" variant="soft" size="sm">
                    Grabando siempre
                  </UBadge>
                </div>
                <p class="text-xs text-muted">
                  La traza se graba sola. Pulsa <strong>Preparar ronda</strong> antes
                  de cada tanda, prueba las frases y luego <strong>Copiar</strong>. Es local.
                </p>

                <div class="flex flex-wrap items-center gap-2">
                  <UButton
                    size="sm"
                    color="primary"
                    variant="soft"
                    icon="i-lucide-circle-dot"
                    @click="prepararRonda"
                  >
                    Preparar ronda
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="outline"
                    icon="i-lucide-copy"
                    @click="copiarTraza"
                  >
                    Copiar
                  </UButton>
                  <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :disabled="!voz.traza.value.length"
                    @click="voz.limpiarTraza()"
                  >
                    Limpiar
                  </UButton>
                  <span class="text-xs text-muted">
                    {{ voz.traza.value.length }} líneas
                  </span>
                </div>

                <p v-if="voz.ultimoEvento.value" class="text-xs text-muted">
                  Último: {{ voz.ultimoEvento.value.evento }}
                </p>

                <p v-if="voz.traza.value.length" class="text-xs text-muted">
                  {{ voz.textoResumenTraza.value }}
                </p>

                <pre
                  v-if="voz.traza.value.length"
                  class="max-h-64 overflow-auto rounded-lg border border-default bg-elevated/50 p-2 font-mono text-[10px] leading-4 whitespace-pre-wrap break-words"
                >{{ voz.textoTraza.value }}</pre>
                <p v-else class="text-xs text-muted">
                  Sin registros todavía.
                </p>

                <div class="rounded-lg border border-default p-2">
                  <p class="text-xs font-medium">
                    Frases de prueba
                  </p>
                  <ol class="list-decimal pl-5 text-xs text-muted">
                    <li>«vende dos refrescos»</li>
                    <li>«vende cinco panes del almacén»</li>
                    <li>«cuánto hay de maní»</li>
                    <li>«cuánto cuesta el refresco»</li>
                    <li>«repite»</li>
                    <li>«abre cuadre»</li>
                    <li>«hola» (control: no es un comando)</li>
                  </ol>
                </div>
              </div>
            </div>
          </template>
        </UCollapsible>
      </div>
    </UCard>
  </div>
</template>
