/**
 * useReloj — Mide y aplica el desfase del equipo contra el servidor.
 *
 * Estado compartido a nivel de módulo (igual que useSync/usePermisos): todos
 * los composables ven la misma medición, y `server-offline` puede leerla sin
 * instanciar nada.
 *
 * Cómo se mide: `GET /api/health` devuelve `timestamp` (epoch del servidor) y
 * se compara con el punto medio del viaje (envío + recepción)/2, que descuenta
 * la mitad del tiempo de ida y vuelta. Con la red de Cuba (1–4 s) el error de
 * la medición es de segundos, suficiente: el problema que se corrige es de una
 * hora, no de milisegundos.
 *
 * Cuándo se mide: al arrancar, tras cada pull (que ya es un roundtrip
 * periódico) y a mano desde Ajustes. Nunca bloquea una escritura: si la
 * medición falla se sigue con el último desfase conocido (0 si nunca hubo).
 */
import { Preferences } from '@capacitor/preferences'
import { $api } from '../utils/api'
import { API_ROUTES } from '../utils/api-paths'
import {
  fijarDesfase,
  desfaseActual,
  desfaseEnMinutos,
  estadoReloj,
  ahoraServidor
} from '../utils/relojServidor'

const PREF_DESFASE = 'reloj_desfase_ms'

/** Diferencia aceptada en la comprobación de salud: más que esto pide avisar. */
export const AVISO_DESFASE_MINUTOS = 5

let cargado = false
let midiendo = null

async function cargarDesdePreferencias() {
  if (cargado) return
  cargado = true
  try {
    const { value } = await Preferences.get({ key: PREF_DESFASE })
    const n = Number(value)
    if (Number.isFinite(n) && n !== 0) fijarDesfase(n)
  } catch { /* sin preferencias: se queda en 0 */ }
}

/**
 * Mide el desfase contra el servidor. Idempotente: llamarla en paralelo
 * devuelve la misma promesa. No lanza: si no hay red, se conserva el último
 * desfase conocido.
 *
 * @returns {Promise<{ ok: boolean, desfaseMs: number }>}
 */
export async function medirReloj() {
  if (midiendo) return midiendo
  midiendo = (async () => {
    await cargarDesdePreferencias()
    const envio = Date.now()
    try {
      const r = await $api(API_ROUTES.health, { timeoutMs: 8000 })
      const recepcion = Date.now()
      const servidor = Number(r?.timestamp)
      if (!Number.isFinite(servidor) || servidor <= 0) return { ok: false, desfaseMs: desfaseActual() }
      const ida = (recepcion - envio) / 2
      const ms = Math.round(servidor - (envio + ida))
      if (!fijarDesfase(ms)) return { ok: false, desfaseMs: desfaseActual() }
      try {
        await Preferences.set({ key: PREF_DESFASE, value: String(desfaseActual()) })
      } catch { /* se aplica solo esta sesión */ }
      return { ok: true, desfaseMs: desfaseActual() }
    } catch {
      return { ok: false, desfaseMs: desfaseActual() }
    }
  })()
  try {
    return await midiendo
  } finally {
    midiendo = null
  }
}

/**
 * Aplica una marca de tiempo que vino del servidor (p. ej. `timestamp_servidor`
 * del pull) sin gastar otra petición. Se usa el mismo punto medio aproximado:
 * el pull termina de recibirse justo ahora, y la respuesta trae el instante con
 * el que el servidor selló la consulta.
 */
export function aplicarMarcaDelServidor(servidorMs, inicioMs) {
  const ahora = Date.now()
  const servidor = Number(servidorMs)
  if (!Number.isFinite(servidor) || servidor <= 0) return false
  const mitad = Math.max(0, (ahora - (Number(inicioMs) || ahora)) / 2)
  return fijarDesfase(Math.round(servidor - (ahora - mitad)))
}

export function useReloj() {
  return {
    medirReloj,
    aplicarMarcaDelServidor,
    ahoraServidor,
    desfaseActual,
    desfaseEnMinutos,
    estadoReloj,
    AVISO_DESFASE_MINUTOS
  }
}
