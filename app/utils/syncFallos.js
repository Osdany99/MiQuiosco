import { useDb } from '../server-offline/db/client'
import { API_ROUTES } from './api-paths'
import { redactarSyncLog } from './syncLog'
import { infoDispositivo } from './dispositivo'

/**
 * Buzón local de fallos de sincronización (Fase 3).
 *
 * El APK guarda aquí los fallos (rechazos por fila, errores de push/pull) y los
 * sube a `POST /api/sync/fallos` en lotes de 100. Se deduplica por `clave`: un
 * fallo repetido incrementa `intentos` en la misma fila en vez de llenar el
 * teléfono.
 *
 * Todo es best-effort: la telemetría nunca rompe una sincronización.
 */

const MAX_POR_LOTE = 100
const MAX_LOTES_POR_SYNC = 3
const MAX_TEXTO = 2000
const MAX_JSON = 8000

function nuevoId() {
  try {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  } catch {
    // fallback abajo
  }
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`
}

function claveDe(datos) {
  return [
    datos.tipo ?? '',
    datos.fase ?? '',
    datos.tabla ?? '',
    datos.registroId ?? '',
    datos.motivo ?? '',
    datos.codigoHttp ?? ''
  ].join('|')
}

function texto(valor, max = MAX_TEXTO) {
  if (valor == null) return null
  const limpio = String(valor).trim()
  return limpio ? limpio.slice(0, max) : null
}

function codigo(valor) {
  if (valor == null || valor === '') return null
  const n = Number(valor)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

/** JSON redactado y truncado (nunca PIN/token). */
function jsonSeguro(valor, max = MAX_JSON) {
  if (valor == null) return null
  try {
    return JSON.stringify(redactarSyncLog(valor)).slice(0, max)
  } catch {
    return null
  }
}

function parseJson(valor) {
  if (!valor) return null
  try {
    return JSON.parse(valor)
  } catch {
    return null
  }
}

/**
 * Registra varios fallos con una sola lectura del buzón. Devuelve cuántos se
 * procesaron (no lanza nunca).
 */
export async function registrarFallosLocales(lista = []) {
  if (!lista.length) return 0

  try {
    const db = useDb()
    const ahora = Date.now()
    const dispositivo = infoDispositivo().modelo
    const existentes = await db.queryAll('sync_fallos')
    const porClave = new Map(existentes.map(f => [f.clave, f]))
    let procesados = 0

    for (const datos of lista) {
      const clave = claveDe(datos)
      const previo = porClave.get(clave)

      if (previo) {
        const intentos = (Number(previo.intentos) || 1) + 1
        await db.update('sync_fallos', previo.id, {
          intentos,
          ultimoEn: ahora,
          mensaje: texto(datos.mensaje) ?? previo.mensaje,
          fila: datos.fila === undefined ? previo.fila : jsonSeguro(datos.fila),
          contexto: datos.contexto === undefined ? previo.contexto : jsonSeguro(datos.contexto)
        })
        previo.intentos = intentos
        previo.ultimoEn = ahora
        procesados++
        continue
      }

      const fila = {
        id: nuevoId(),
        clave,
        creadoEn: ahora,
        ultimoEn: ahora,
        tipo: texto(datos.tipo, 40) ?? 'otro',
        fase: texto(datos.fase, 20),
        tabla: texto(datos.tabla, 60),
        registroId: texto(datos.registroId, 100),
        loteId: texto(datos.loteId, 60),
        codigoHttp: codigo(datos.codigoHttp),
        motivo: texto(datos.motivo, 80),
        mensaje: texto(datos.mensaje),
        fila: jsonSeguro(datos.fila),
        contexto: jsonSeguro(datos.contexto),
        appVersion: texto(datos.appVersion, 32),
        dispositivo: texto(datos.dispositivo, 80) ?? dispositivo,
        intentos: 1,
        subidoEn: null
      }

      await db.insert('sync_fallos', fila)
      porClave.set(clave, fila)
      procesados++
    }

    return procesados
  } catch {
    // La telemetría nunca rompe la sincronización.
    return 0
  }
}

/** Variante de un solo fallo. */
export async function registrarFalloLocal(datos) {
  return (await registrarFallosLocales([datos])) > 0
}

/** Fallos aún no subidos, de más antiguo a más reciente. */
export async function fallosPendientes(maximo = MAX_POR_LOTE) {
  try {
    const db = useDb()
    const filas = await db.queryAll('sync_fallos')
    return filas
      .filter(f => !f.subidoEn)
      .sort((a, b) => (Number(a.creadoEn) || 0) - (Number(b.creadoEn) || 0))
      .slice(0, maximo)
  } catch {
    return []
  }
}

function aPayload(fila) {
  return {
    tipo: fila.tipo || 'otro',
    fase: fila.fase || null,
    tabla: fila.tabla || null,
    registroId: fila.registroId || null,
    loteId: fila.loteId || null,
    codigoHttp: codigo(fila.codigoHttp),
    motivo: fila.motivo || null,
    mensaje: fila.mensaje || null,
    fila: parseJson(fila.fila),
    contexto: parseJson(fila.contexto),
    appVersion: fila.appVersion || null,
    dispositivo: fila.dispositivo || null,
    ocurridoEn: Number(fila.creadoEn) || Date.now(),
    intentos: Math.max(1, Number(fila.intentos) || 1)
  }
}

/**
 * Sube el buzón en lotes de 100. `fetch` es el wrapper autenticado de useSync;
 * se inyecta para no acoplar este util a la composable.
 *
 * Devuelve cuántos fallos se marcaron como subidos.
 */
export async function subirFallosPendientes(fetch, { maxLotes = MAX_LOTES_POR_SYNC } = {}) {
  if (typeof fetch !== 'function') return 0

  let subidos = 0

  for (let lote = 0; lote < maxLotes; lote++) {
    const pendientes = await fallosPendientes(MAX_POR_LOTE)
    if (!pendientes.length) break

    await fetch(API_ROUTES.syncFallos, {
      method: 'POST',
      body: { fallos: pendientes.map(aPayload) },
      timeoutMs: 20000
    })

    const db = useDb()
    const ahora = Date.now()
    for (const fila of pendientes) {
      await db.update('sync_fallos', fila.id, { subidoEn: ahora })
    }

    subidos += pendientes.length
    if (pendientes.length < MAX_POR_LOTE) break
  }

  return subidos
}

export { MAX_POR_LOTE as MAX_FALLOS_POR_LOTE }
