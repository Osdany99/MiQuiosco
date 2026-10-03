/**
 * app/utils/sms.js - Puente con el plugin nativo SmsReader.
 *
 * Envoltorio fino sobre el plugin: normaliza la forma de respuesta, degrada a
 * un estado "no disponible" cuando se corre en web o en un build viejo sin el
 * plugin, y encapsula el pedir permisos.
 *
 * El plugin nativo (android/.../SmsReaderPlugin.java) expone:
 *   estado()               -> { permisoRecibir, permisoLeer, remitentes, pendientes }
 *   leerPendientes()       -> { mensajes: [...] }  (drena la cola)
 *   verPendientes()        -> { mensajes: [...] }  (mira sin drenar)
 *   limpiar()              -> {}
 *   setRemitentes({...})   -> {}
 *   barrerBuzon({ desde }) -> { mensajes: [...] }  (capa 3, pide READ_SMS)
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

const SmsReader = registerPlugin('SmsReader')

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
      remitentes: Array.isArray(d.remitentes) ? d.remitentes : [],
      pendientes: Number(d.pendientes) || 0
    }
  } catch {
    return { ...SMS_NO_DISPONIBLE }
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
 * Barrido del buzón (capa 3). Pide READ_SMS si falta: en ese caso devuelve
 * { permisoRequerido: true } para que el JS lo encaje en su propio flujo de
 * onboarding en vez de pedirlo aquí a ciegas.
 */
export async function smsBarrerBuzon({ desde = 0 } = {}) {
  if (!esNativo()) return { mensajes: [], error: null, permisoRequerido: false }
  try {
    const d = plano(await SmsReader.barrerBuzon({ desde }))
    return { mensajes: normaliza(d.mensajes), error: null, permisoRequerido: false }
  } catch (error) {
    return { mensajes: [], error, permisoRequerido: true }
  }
}

/**
 * Comprueba el permiso RECEIVE_SMS y lo pide si falta. El plugin no declara
 * permisos en la anotación, así que el pedido se hace directamente con
 * Capacitor's Permissions API para no arrastrar requestPermissionForAliases
 * al JS.
 */
export async function smsPedirPermisoRecibir() {
  if (!esNativo()) return false
  try {
    const { Permissions } = await import('@capacitor/core')
    const res = await Permissions.request({ name: 'android.permission.RECEIVE_SMS' })
    return res.state === 'granted'
  } catch {
    return false
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
    // Índice local para el v-for; el hash puede venir vacío en inyección manual.
    clave: m.hash || `${m.remitente}-${i}-${m.recibidoEn}`
  }))
}
