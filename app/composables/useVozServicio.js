import { Capacitor, registerPlugin } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { computed, ref } from 'vue'
import { useAuth } from './useAuth'

/**
 * useVozServicio — controla la escucha con la app cerrada (Android).
 *
 * El servicio en primer plano NO registra ventas: deja la transcripción en
 * `files/voz/inbox` y la app la convierte en acción pendiente al volver. Se
 * apaga mientras la app está abierta porque el dock necesita el micrófono.
 *
 * En web no existe: todo queda como no disponible.
 */

const PREF = 'voz.servicio.activo'
/** Misma clave que Ajustes: el motor de voz elegido allí manda también aquí. */
const PREF_MOTOR = 'voz.motor'
/** Onda del dock sobre el bloqueo al dictar con la app cerrada. */
const PREF_ONDA = 'voz.servicio.onda'
const WAKE = 'oye nova'
const IDIOMA = 'es-US'

const VozServicio = registerPlugin('VozServicio')

const preferencia = ref(false)
const activo = ref(false)
const pausado = ref(false)
const anotados = ref(0)
const disponible = ref(false)
const permiso = ref(false)
const notificaciones = ref(true)
const exentoBateria = ref(true)
/** Onda del dock con la app cerrada (activable en Ajustes). */
const onda = ref(false)
/** La ventana a pantalla completa está permitida por el sistema (Android 14+). */
const pantallaCompleta = ref(true)
/** Motor con el que está escuchando ahora mismo: 'sistema' | 'vosk' | ''. */
const motorActual = ref('')
const cambiando = ref(false)
const error = ref(null)
let cargada = false

function aplicarEstado(r) {
  if (!r) return
  activo.value = Boolean(r.activo)
  pausado.value = Boolean(r.pausado)
  anotados.value = Number(r.anotados) || 0
  disponible.value = Boolean(r.disponible)
  permiso.value = Boolean(r.permiso)
  if (r.notificaciones != null) notificaciones.value = Boolean(r.notificaciones)
  if (r.exentoBateria != null) exentoBateria.value = Boolean(r.exentoBateria)
  if (r.onda != null) onda.value = Boolean(r.onda)
  if (r.pantallaCompleta != null) pantallaCompleta.value = Boolean(r.pantallaCompleta)
  if (r.motor != null) motorActual.value = String(r.motor)
}

function esNativo() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Traduce la preferencia de Ajustes al motor del servicio:
 * `vosk` → offline empaquetado, `google` → reconocedor del sistema y
 * `automatico` → también Vosk: el reconocedor del sistema pita cada vez que
 * abre el micrófono y el servicio abre una sesión por frase, así que en el
 * bolsillo sonaba un pitido constante. Vosk escucha en silencio y sin datos.
 */
function motorDelServicio(valor) {
  if (valor === 'google') return 'sistema'
  return 'vosk'
}

export function useVozServicio() {
  const auth = useAuth()
  const nativo = esNativo()

  async function cargarPreferencia() {
    if (!nativo) return preferencia.value
    if (cargada) return preferencia.value
    try {
      const { value } = await Preferences.get({ key: PREF })
      preferencia.value = value === 'true'
    } catch {
      preferencia.value = false
    }
    cargada = true
    return preferencia.value
  }

  /** Motor configurado en Ajustes (sin caché: el jefe puede cambiarlo). */
  async function motorConfigurado() {
    if (!nativo) return 'auto'
    try {
      const { value } = await Preferences.get({ key: PREF_MOTOR })
      return motorDelServicio(value)
    } catch {
      return 'auto'
    }
  }

  async function refrescar() {
    if (!nativo) return
    try {
      aplicarEstado(await VozServicio.estado())
    } catch {
      /* plugin no disponible */
    }
  }

  async function iniciar({ pausado: arrancarPausado = false } = {}) {
    if (!nativo) return
    if (!auth.esJefe.value || !auth.usuarioActual.value?.puestoId) return
    cambiando.value = true
    error.value = null
    try {
      const motor = await motorConfigurado()
      aplicarEstado(await VozServicio.iniciar({ wake: WAKE, idioma: IDIOMA, motor, pausado: arrancarPausado }))
      // El servicio avisa su estado al arrancar, pero la respuesta del plugin
      // puede llegar antes de que el servicio esté creado.
      activo.value = true
      if (arrancarPausado) pausado.value = true
    } catch (e) {
      error.value = e?.message?.includes('permission')
        ? 'Falta el permiso de micrófono para escuchar en segundo plano.'
        : (e?.message ?? 'No se pudo iniciar la escucha.')
      preferencia.value = false
      await Preferences.set({ key: PREF, value: 'false' }).catch(() => {})
    } finally {
      cambiando.value = false
    }
  }

  async function pausar() {
    if (!nativo) return
    try {
      aplicarEstado(await VozServicio.pausar())
    } catch {
      /* servicio no vivo */
    }
  }

  async function reanudar() {
    if (!nativo) return
    cambiando.value = true
    try {
      aplicarEstado(await VozServicio.reanudar())
    } catch (e) {
      error.value = e?.message ?? 'No se pudo reanudar la escucha.'
    } finally {
      cambiando.value = false
    }
  }

  async function detener() {
    if (!nativo) return
    try {
      aplicarEstado(await VozServicio.detener())
    } catch {
      /* ya estaba detenido */
    }
  }

  /** Enciende o apaga el servicio y recuerda la decisión. */
  async function activar(valor) {
    const quiere = Boolean(valor)
    preferencia.value = quiere
    error.value = null
    try {
      await Preferences.set({ key: PREF, value: String(quiere) })
    } catch {
      /* sin persistencia, vale para esta sesión */
    }
    if (quiere) await iniciar({ pausado: true })
    else await detener()
    await refrescar()
  }

  /**
   * Pide al sistema que no mate la app en segundo plano. Sin esto, HyperOS/EMUI
   * apagan el servicio a los pocos minutos y la escucha deja de funcionar sin
   * ningún aviso.
   */
  async function pedirExencionBateria() {
    if (!nativo) return
    try {
      aplicarEstado(await VozServicio.pedirExencionBateria())
    } catch {
      /* el diálogo lo controla el sistema */
    }
  }

  /**
   * Enciende o apaga la onda sobre el bloqueo. El servicio lee la preferencia
   * en cada dictado, así que no hay que reiniciarlo.
   */
  async function activarOnda(valor) {
    const quiere = Boolean(valor)
    onda.value = quiere
    try {
      await Preferences.set({ key: PREF_ONDA, value: String(quiere) })
    } catch {
      /* sin persistencia queda para esta sesión */
    }
    await refrescar()
  }

  /** Abre los ajustes de «pantalla completa» (Android 14+). */
  async function pedirPantallaCompleta() {
    if (!nativo) return
    try {
      aplicarEstado(await VozServicio.pedirPantallaCompleta())
    } catch {
      /* lo decide el sistema */
    }
  }

  /**
   * Ajusta la escucha al estado de la app: abierta → pausa (el dock manda),
   * en segundo plano → escucha. Se llama al montar y en cada cambio de estado.
   *
   * El servicio se arranca siempre con la app visible: Android 14 no permite
   * iniciar un servicio de micrófono desde segundo plano. Arranca en pausa y el
   * micrófono se abre recién al minimizar la app.
   */
  async function sincronizarConApp(appAbierta) {
    if (!nativo) return
    await cargarPreferencia()
    if (!preferencia.value) {
      if (activo.value) await detener()
      return
    }
    if (!auth.esJefe.value) {
      await detener()
      return
    }
    if (appAbierta) {
      if (!activo.value) await iniciar({ pausado: true })
      else await pausar()
    } else {
      await reanudar()
    }
    await refrescar()
  }

  const habilitado = computed(() =>
    nativo && auth.esJefe.value && preferencia.value && disponible.value
  )

  /** Aviso accionable: el servicio está activo pero el sistema lo va a matar. */
  const faltaExencionBateria = computed(() =>
    nativo && preferencia.value && !exentoBateria.value
  )

  const faltaPermisoNotificaciones = computed(() =>
    nativo && preferencia.value && !notificaciones.value
  )

  /** La onda está activada pero el sistema no deja abrir la ventana. */
  const faltaPantallaCompleta = computed(() =>
    nativo && preferencia.value && onda.value && !pantallaCompleta.value
  )

  return {
    esNativo: nativo,
    preferencia,
    activo,
    pausado,
    anotados,
    disponible,
    permiso,
    notificaciones,
    exentoBateria,
    onda,
    pantallaCompleta,
    motorActual,
    cambiando,
    error,
    habilitado,
    faltaExencionBateria,
    faltaPermisoNotificaciones,
    faltaPantallaCompleta,
    cargarPreferencia,
    refrescar,
    activar,
    iniciar,
    pausar,
    reanudar,
    detener,
    pedirExencionBateria,
    activarOnda,
    pedirPantallaCompleta,
    sincronizarConApp
  }
}
