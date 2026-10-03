/**
 * useSmsEtecsa - Estado compartido del subsistema de captura de SMS.
 *
 * Responsabilidad: mover los mensajes desde la cola nativa al dominio. Ya no
 * guarda una lista propia en memoria —la bandeja vive en `sms_etecsa`— porque
 * una lista de sesión se pierde al reiniciar el WebView y hacía creer que no
 * había recargas pendientes.
 *
 * El estado es a scope de módulo (fuera de la función) por el mismo motivo que
 * en useAppUpdate: varias pantallas llaman a useSmsEtecsa() y con refs propias
 * cada una vería una cola distinta.
 */
import { App } from '@capacitor/app'
import { useRecargas } from './useRecargas'
import {
  smsEstado,
  smsLeerPendientes,
  smsVerPendientes,
  smsBarrerBuzon,
  smsLimpiar,
  smsPedirPermisos,
  smsPedirPermisoNotificaciones,
  smsAbrirAjustesPermisos
} from '../utils/sms'

/**
 * Estado del subsistema. Es un ref con un objeto plano y NO un readonly:
 * readonly() devuelve un proxy reactivo que Vue no sabe serializar, y las
 * pantallas que lo usan en listas fallan al renderizar. Quien lo consume lo
 * lee por `.value`.
 */
const estado = ref({
  disponible: false,
  permisoRecibir: false,
  permisoLeer: false,
  notificaciones: false,
  restringido: false,
  remitentes: [],
  pendientes: 0
})
const cargando = ref(false)

let _resumeHook = null

export function useSmsEtecsa() {
  /**
   * Lee la cola del plugin y pasa lo que haya al dominio (parseo → bandeja).
   * Idempotente: el hash único de `sms_etecsa` hace que reprocesar los mismos
   * mensajes no duplique nada, así que se puede llamar en cada mount/resume.
   *
   * @param {object} [opts]
   * @param {boolean} [opts.drenar=true] si es false solo mira sin vaciar.
   * @returns {Promise<{pendientes:number, descartadas:number, duplicadas:number, omitidas:number}>}
   */
  async function cargar({ drenar = true } = {}) {
    cargando.value = true
    try {
      estado.value = await smsEstado()
      if (!estado.value.disponible) return null

      const res = drenar ? await smsLeerPendientes() : await smsVerPendientes()
      if (!res.mensajes?.length) {
        await refrescarEstado()
        return null
      }

      const { stats } = await useRecargas().procesarLote(res.mensajes)
      await refrescarEstado()
      return stats
    } finally {
      cargando.value = false
    }
  }

  /** Recarga permisos/tamaño de cola sin tocar la bandeja. */
  async function refrescarEstado() {
    estado.value = await smsEstado()
    return estado.value
  }

  /**
   * Capa 3: barre el buzón del sistema. Complementa al BroadcastReceiver para
   * el caso en que este no se ejecutó (app force-stopped, o un fabricante que
   * bloquea la recepción en background).
   *
   * Lo que ya está en el historial no vuelve a proponerlo: el dominio
   * descarta por ID de transacción.
   *
   * @param {object} [opts]
   * @param {number} [opts.desde=0] marca de tiempo en milisegundos.
   */
  async function barrer({ desde = 0 } = {}) {
    const res = await smsBarrerBuzon({ desde })
    if (res.permisoRequerido || res.permisoFalta) return { mensajes: [], permisoRequerido: true }
    return { mensajes: res.mensajes || [], permisoRequerido: false }
  }

  /**
   * Pide los permisos de SMS. Devuelve el detalle del resultado para poder
   * distinguir "el usuario lo negó" de "el diálogo ni siquiera apareció"
   * (que fue un bug real: Permissions no venía de @capacitor/core).
   */
  async function pedirPermiso() {
    const res = await smsPedirPermisos()
    await refrescarEstado()
    return res
  }

  /** Pide POST_NOTIFICATIONS (solo relevante desde Android 13). */
  async function pedirPermisoNotificaciones() {
    return smsPedirPermisoNotificaciones()
  }

  /**
   * Abre Ajustes. Por defecto va a "ajustes restringidos", que es el candado
   * real sobre los permisos sensibles de una app sideloaded.
   */
  function abrirAjustesPermisos(opcion = 'restringidos') {
    return smsAbrirAjustesPermisos(opcion)
  }

  /** Vacía la cola nativa. La bandeja ya guardada no se toca. */
  async function limpiarCola() {
    await smsLimpiar()
    await refrescarEstado()
  }

  /**
   * Recarga al volver a primer plano. Es el momento clave: si el proceso
   * estuvo muerto, la cola nativa tiene lo que se perdió mientras tanto.
   */
  function observarResume() {
    if (_resumeHook) return () => {}
    _resumeHook = true
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) cargar().catch(() => {})
    })
    return () => {
      _resumeHook = null
      handle.then(h => h.remove()).catch(() => {})
    }
  }

  return {
    estado,
    cargando,
    cargar,
    refrescarEstado,
    barrer,
    pedirPermiso,
    pedirPermisoNotificaciones,
    abrirAjustesPermisos,
    limpiarCola,
    observarResume
  }
}
