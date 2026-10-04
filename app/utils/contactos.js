/**
 * app/utils/contactos.js - Puente con el plugin nativo Contactos.
 *
 * Sirve para crear clientes rápido importando la agenda del teléfono, en vez
 * de teclearlos uno por uno. Como el resto de puentes, degrada a "no
 * disponible" en web para que la UI pueda avisar sin reventar.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

const Contactos = registerPlugin('Contactos')

/** Estado inicial para cuando no hay plugin (web o build viejo). */
export const CONTACTOS_NO_DISPONIBLE = {
  disponible: false,
  permiso: false,
  restringido: false,
  contactos: []
}

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

export async function contactosEstado() {
  if (!esNativo()) return { ...CONTACTOS_NO_DISPONIBLE }
  try {
    const d = plano(await Contactos.estado())
    return {
      disponible: true,
      permiso: !!d.permiso,
      restringido: !!d.restringido
    }
  } catch {
    return { ...CONTACTOS_NO_DISPONIBLE }
  }
}

/** Pide READ_CONTACTS. Devuelve el estado real ya comprobado. */
export async function contactosPedirPermiso() {
  if (!esNativo()) return { ok: false, permiso: false }
  try {
    const d = plano(await Contactos.pedirPermiso())
    return { ok: !!d.permiso, permiso: !!d.permiso }
  } catch {
    return { ok: false, permiso: false }
  }
}

/**
 * Lista los contactos con sus números. Nunca lanza: sin permiso (o si el
 * proveedor falla) devuelve lista vacía y `permiso: false`, para que la
 * pantalla pueda explicar el motivo en vez de romperse.
 *
 * @returns {Promise<{ permiso: boolean, contactos: Array<{id,nombre,telefonos:string[]}> }>}
 */
export async function contactosListar() {
  if (!esNativo()) return { permiso: false, contactos: [] }
  try {
    const d = plano(await Contactos.listar())
    const lista = Array.isArray(d.contactos) ? d.contactos : []
    return {
      permiso: d.permiso !== false,
      contactos: lista.map(c => ({
        id: String(c.id ?? ''),
        nombre: String(c.nombre ?? '').trim(),
        telefonos: Array.isArray(c.telefonos) ? c.telefonos.filter(Boolean) : []
      }))
    }
  } catch {
    return { permiso: false, contactos: [] }
  }
}
