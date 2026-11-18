/**
 * Utilidades compartidas del panel de administración (`/admin`).
 *
 * Son funciones puras que usan las cuatro vistas del panel; si vivieran en una
 * sola página habría duplicación de formato y de extracción de errores.
 */

/** Fecha y hora legibles; `—` cuando no hay valor o es inválido. */
export function fmtFechaHora(valor) {
  if (!valor) return '—'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return '—'
  return fecha.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Mensaje de error de una petición `$fetch`/ofetch.
 *
 * Los endpoints lanzan `createError({ statusMessage })`, que llega en
 * `err.data.statusMessage`; los fallos de red no traen cuerpo y se traducen a
 * un texto útil en vez del críptico "Failed to fetch".
 */
export function mensajeErrorAdmin(err, fallback = 'No se pudo completar la operación.') {
  const mensaje = err?.data?.statusMessage
    || err?.data?.message
    || err?.statusMessage

  if (mensaje) return mensaje

  const status = err?.statusCode ?? err?.status ?? err?.response?.status
  const texto = typeof err?.message === 'string' ? err.message.trim() : ''

  // Sin status HTTP el error lo lanzó la propia app (ej. una cuenta de jefe en
  // el panel): su mensaje es el útil, no un "no se pudo conectar".
  if (!status) {
    if (texto && !/failed to fetch|networkerror|load failed|fetch failed/i.test(texto)) {
      return texto
    }
    return 'No se pudo conectar con el servidor.'
  }

  return texto || fallback
}

/** Primer mensaje de un `safeParse` fallido de Zod. */
export function primerErrorZod(resultado) {
  return resultado?.error?.issues?.[0]?.message ?? 'Datos inválidos.'
}

/** JSON legible para la fila/contexto de un fallo. */
export function textoJson(valor) {
  if (valor == null) return ''
  try {
    return JSON.stringify(valor, null, 2)
  } catch {
    return String(valor)
  }
}

/** Etiqueta humana para los enums de fallos (`push_rechazo` → `Push rechazo`). */
export function etiquetaFallo(valor) {
  if (!valor) return '—'
  const texto = String(valor).replaceAll('_', ' ')
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}
