/**
 * app/utils/voice/proofs.js — Auditoría local de la confirmación hablada.
 *
 * Guarda un registro por cada intento de auto-confirmación: qué se entendió,
 * qué producto/ubicación y si terminó en venta o se abandonó. No guarda audio
 * ni texto crudo de voz. Se conserva en Preferences (nativo) con fallback a
 * localStorage (web) para no perderlo al recargar.
 *
 * La subida a `voz_confirmaciones` es best-effort: si falla (sin red, 401,
 * servidor caído) el proof entra en una cola local y se reintenta al volver la
 * red. Un proof nunca se pierde por un corte de cobertura.
 */
import { Preferences } from '@capacitor/preferences'
import { $api, esErrorDeRed } from '../api'
import { cabecerasDePrueba } from './auditoria'
import {
  agregarProof,
  marcarIntentoFallido,
  proofsPendientes,
  purgarCola,
  quitarProof
} from './colaProofs'

const KEY = 'voice.proofs'
const KEY_COLA = 'voice.proofs.cola'
const MAX = 50

// Una sola pasada de reintento a la vez: el evento `online` y el arranque
// pueden coincidir y no deben subir el mismo proof dos veces.
let reintentando = false

function leerLocal(clave = KEY) {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(clave)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function leerPreferencias(clave = KEY) {
  try {
    const { value } = await Preferences.get({ key: clave })
    if (!value) return []
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Lee una lista: Preferences manda y localStorage es la red de seguridad. */
async function leerLista(clave) {
  const enPreferencias = await leerPreferencias(clave)
  if (enPreferencias.length) return enPreferencias
  return leerLocal(clave)
}

/** Guarda en ambos sitios; si uno falla, el otro sigue siendo válido. */
async function guardarLista(clave, lista) {
  const valor = JSON.stringify(lista)
  try {
    await Preferences.set({ key: clave, value: valor })
  } catch {
    /* noop: en web Preferences puede no existir */
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(clave, valor)
  } catch {
    /* noop */
  }
}

function leerCola() {
  return leerLista(KEY_COLA)
}

function guardarCola(cola) {
  return guardarLista(KEY_COLA, cola)
}

function hayRed() {
  return !(typeof navigator !== 'undefined' && navigator.onLine === false)
}

function idDeProof(proof) {
  const base = `${proof?.ts ?? ''}-${proof?.productoId ?? ''}-${proof?.outcome ?? ''}`
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${base}-${crypto.randomUUID()}`
    }
  } catch {
    /* noop */
  }
  return `${base}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Clasifica el fallo de subida. Una sesión vencida (401/403) o una APK obsoleta
 * (426) no son culpa del proof: se deja esperando sin gastar intentos. Un fallo
 * de red corta la pasada: los demás fallarían igual.
 */
function motivoDeError(err) {
  if (esErrorDeRed(err)) return 'red'
  const status = Number(err?.statusCode ?? err?.status ?? err?.response?.status) || 0
  return (status === 401 || status === 403 || status === 426) ? 'sesion' : 'error'
}

/**
 * Sube un proof al servidor.
 * @returns {Promise<{ ok: boolean, motivo?: 'sin-red'|'red'|'sesion'|'error' }>}
 */
async function subirProof(proof, token = null) {
  // Auditoría central best-effort: sin red no se intenta (el proof queda en la
  // cola y se reintenta al volver la conexión).
  //
  // Va por `$api` (no `fetch` crudo): el endpoint exige `Authorization` y el
  // wrapper añade además `x-dispositivo-id` y `x-app-version-code` en nativo.
  // Con `fetch` + `credentials:'include'` el servidor respondía 401 siempre.
  if (!hayRed()) return { ok: false, motivo: 'sin-red' }
  try {
    await $api('/api/voz/confirmaciones', {
      method: 'POST',
      body: proof,
      headers: cabecerasDePrueba(token)
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, motivo: motivoDeError(err) }
  }
}

export async function registrarProof(proof, { token = null } = {}) {
  if (!proof || typeof proof !== 'object') return null
  const item = { ts: new Date().toISOString(), ...proof }
  const previos = await leerProofs()
  const recorte = [...previos, item].slice(-MAX)
  await guardarLista(KEY, recorte)

  // El proof ya está a salvo en el teléfono: subirlo es opcional y no debe
  // retrasar el aviso al jefe. Si falla, queda en la cola para el siguiente
  // intento con red.
  void encolarSiNoSube(item, token).catch(() => {})
  return item
}

async function encolarSiNoSube(item, token) {
  if ((await subirProof(item, token)).ok) return
  const entrada = { id: idDeProof(item), proof: item, creado: item.ts, intentos: 0 }
  await guardarCola(agregarProof(await leerCola(), entrada))
}

/**
 * Reintenta los proofs que quedaron sin subir. Se llama al arrancar la app y
 * cuando vuelve la red; una sola pasada a la vez.
 *
 * @returns {Promise<{ subidos: number, pendientes: number }>}
 */
export async function reintentarProofs({ token = null } = {}) {
  if (reintentando) return { subidos: 0, pendientes: (await leerCola()).length }
  reintentando = true
  let subidos = 0
  try {
    // Sin red no se gasta ni una petición: la cola espera intacta.
    if (!hayRed()) return { subidos: 0, pendientes: (await leerCola()).length }

    let cola = purgarCola(await leerCola())
    for (const entrada of proofsPendientes(cola)) {
      // Si la red se cae a mitad de la pasada, se corta y se conserva el resto.
      if (!hayRed()) break
      const resultado = await subirProof(entrada?.proof, token)
      if (resultado.ok) {
        cola = quitarProof(cola, entrada.id)
        subidos++
      } else if (resultado.motivo === 'sesion' || resultado.motivo === 'red' || resultado.motivo === 'sin-red') {
        // Token vencido o red caída: los demás fallarían igual. Se corta la
        // pasada; el proof actual solo gasta intento cuando el fallo es de red
        // (un 401 no es culpa suya).
        if (resultado.motivo === 'red') cola = marcarIntentoFallido(cola, entrada.id)
        await guardarCola(cola)
        break
      } else {
        cola = marcarIntentoFallido(cola, entrada.id)
      }
      // Guardar tras cada proof: si la app muere, no se repite lo ya subido.
      await guardarCola(cola)
    }
    cola = purgarCola(cola)
    await guardarCola(cola)
    return { subidos, pendientes: cola.length }
  } finally {
    reintentando = false
  }
}

export async function leerProofs() {
  return leerLista(KEY)
}
