/**
 * app/utils/sms.js - Puente con el plugin nativo SmsReader.
 *
 * Envoltorio fino sobre el plugin: normaliza la forma de respuesta y degrada a
 * un estado "no disponible" cuando se corre en web o en un build viejo sin el
 * plugin, para que la UI pueda mostrarlo sin reventar.
 *
 * El plugin nativo (android/.../SmsReaderPlugin.java) expone:
 *   estado()                    -> { permisoRecibir, permisoLeer, notificaciones, restringido, remitentes, pendientes }
 *   pedirPermisos()             -> { permisoRecibir, permisoLeer, concedidos }
 *   leerPendientes()            -> { mensajes: [...] }  (drena la cola)
 *   verPendientes()             -> { mensajes: [...] }  (mira sin drenar)
 *   limpiar()                   -> {}
 *   setRemitentes({ remitentes }) -> {}
 *   barrerBuzon({ desde })      -> { mensajes, permisoFalta? }  (capa 3)
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

const SmsReader = registerPlugin('SmsReader')

export const PERMISOS_SMS = [
  'android.permission.RECEIVE_SMS',
  'android.permission.READ_SMS'
]

/** Capacitor devuelve { data } en éxito; lo aplanamos a un objeto plano. */
function plano(resultado) {
  return resultado?.data ?? {}
}

function esNativo() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** Estado inicial para cuando no hay plugin: la UI puede mostrarlo sin-crash. */
export const SMS_NO_DISPONIBLE = {
  disponible: false,
  permisoRecibir: false,
  permisoLeer: false,
  notificaciones: false,
  restringido: false,
  remitentes: [],
  pendientes: 0
}

export async function smsEstado() {
  if (!esNativo()) return { ...SMS_NO_DISPONIBLE }
  try {
    const d = plano(await SmsReader.estado())
    return {
      disponible: true,
      permisoRecibir: !!d.permisoRecibir,
      permisoLeer: !!d.permisoLeer,
      notificaciones: !!d.notificaciones,
      restringido: !!d.restringido,
      remitentes: Array.isArray(d.remitentes) ? d.remitentes : [],
      pendientes: Number(d.pendientes) || 0
    }
  } catch {
    return { ...SMS_NO_DISPONIBLE }
  }
}

/**
 * Pide los permisos de SMS.
 *
 * NO se usa registerPlugin('Permissions'): ese plugin ya no existe en
 * Capacitor 8 — capacitor-android 8.4.1 solo empaqueta WebView, CapacitorHttp,
 * CapacitorCookies y SystemBars. Llamarlo falla sin llegar al nativo y el
 * usuario ve un "denegado" sin que Android le haya preguntado nada.
 *
 * El pedido real lo hace SmsReaderPlugin con requestPermissionForAliases, que
 * es la vía soportada.
 *
 * @returns {Promise<{ok: boolean, permisoRecibir: boolean, permisoLeer: boolean}>}
 *   `ok` indica que se concedió al menos algo; `permisoRecibir` es el que
 *   realmente importa para capturar recargas.
 */
export async function smsPedirPermisos() {
  if (!esNativo()) return { ok: false, permisoRecibir: false, permisoLeer: false }
  try {
    const d = plano(await SmsReader.pedirPermisos())
    return {
      ok: !!d.concedidos,
      permisoRecibir: !!d.permisoRecibir,
      permisoLeer: !!d.permisoLeer
    }
  } catch (error) {
    return { ok: false, permisoRecibir: false, permisoLeer: false, error }
  }
}

/**
 * Drena la cola. Devuelve { mensajes, error } — nunca lanza, para que el
 * llamador en un onMounted no tenga que envolver en try/catch.
 */
export async function smsLeerPendientes() {
  if (!esNativo()) return { mensajes: [], error: null }
  try {
    const d = plano(await SmsReader.leerPendientes())
    return { mensajes: normaliza(d.mensajes), error: null }
  } catch (error) {
    return { mensajes: [], error }
  }
}

export async function smsVerPendientes() {
  if (!esNativo()) return { mensajes: [], error: null }
  try {
    const d = plano(await SmsReader.verPendientes())
    return { mensajes: normaliza(d.mensajes), error: null }
  } catch (error) {
    return { mensajes: [], error }
  }
}

export async function smsLimpiar() {
  if (!esNativo()) return false
  try {
    await SmsReader.limpiar()
    return true
  } catch {
    return false
  }
}

export async function smsSetRemitentes(remitentes) {
  if (!esNativo()) return false
  try {
    await SmsReader.setRemitentes({ remitentes })
    return true
  } catch {
    return false
  }
}

/**
 * Pide POST_NOTIFICATIONS para poder avisar de las recargas.
 *
 * En Android 13 o inferior el permiso se concede en la instalación y el plugin
 * responde granted sin abrir nada; el booleano indica si realmente se puede
 * notificar.
 */
export async function smsPedirPermisoNotificaciones() {
  if (!esNativo()) return { ok: false, notificaciones: false }
  try {
    const d = plano(await SmsReader.pedirPermisoNotificaciones())
    return { ok: !!d.notificaciones, notificaciones: !!d.notificaciones }
  } catch (error) {
    return { ok: false, notificaciones: false, error }
  }
}

/**
 * Abre Ajustes para destrabar los permisos restringidos.
 *
 * Contexto importante: Android marca como *restringidos* los permisos sensibles
 * de apps instaladas fuera de Google Play. Mientras la app sea sideloaded, el
 * interruptor de SMS sale bloqueado con "A la app se le negó el acceso a SMS" y
 * no hay forma de activarlo desde la pantalla de permisos: hay que habilitar
 * antes "Permitir ajustes restringidos" en Ajustes → Apps → la app → ⋮.
 *
 * @param {'restringidos'|'permisos'} [opcion='restringidos']
 *   'restringidos' lleva directo a esa pantalla; 'permisos' a la de la app.
 */
export async function smsAbrirAjustesPermisos(opcion = 'restringidos') {
  if (!esNativo()) return false
  try {
    await SmsReader.abrirAjustesPermisos({ opcion })
    return true
  } catch {
    return false
  }
}

/**
 * ¿Siguen restringidos los permisos de esta app?
 *
 * Android llama "sideloaded" a toda app que no venga de Google Play y le
 * bloquea los permisos sensibles tras un candado en Ajustes. Con el candado
 * puesto, el permiso de SMS sale gris y el diálogo del sistema no concede
 * nada. Por eso el onboarding tiene dos pasos: desbloquear, y solo después
 * pedir el permiso.
 */
export async function smsEstaRestringido() {
  if (!esNativo()) return false
  try {
    const d = plano(await SmsReader.estaRestringido())
    return !!d.restringido
  } catch {
    // Si no se puede consultar, asumir que NO lo está evita bloquear al
    // usuario con un paso que igual ya dio.
    return false
  }
}

/**
 * Barrido del buzón (capa 3). Devuelve permisoRequerido si falta READ_SMS, para
 * que el JS lo pida con smsPedirPermisos() en lugar de abrir otro diálogo aquí.
 */
export async function smsBarrerBuzon({ desde = 0 } = {}) {
  if (!esNativo()) return { mensajes: [], error: null, permisoRequerido: false }
  try {
    const d = plano(await SmsReader.barrerBuzon({ desde }))
    if (d.permisoFalta) return { mensajes: [], error: null, permisoRequerido: true }
    return { mensajes: normaliza(d.mensajes), error: null, permisoRequerido: false }
  } catch (error) {
    return { mensajes: [], error, permisoRequerido: false }
  }
}

function normaliza(mensajes) {
  if (!Array.isArray(mensajes)) return []
  return mensajes.map((m, i) => ({
    hash: m.hash ?? null,
    remitente: m.remitente ?? '',
    cuerpo: m.cuerpo ?? '',
    recibidoEn: Number(m.recibidoEn) || 0,
    origen: m.origen ?? 'cola',
    // Índice local para el v-for; el hash puede venir vacío.
    clave: m.hash || `${m.remitente}-${i}-${m.recibidoEn}`
  }))
}
