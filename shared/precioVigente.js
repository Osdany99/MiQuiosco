/**
 * precioVigente.js — Derivación determinista del precio de venta vigente.
 *
 * Fase 12: el historial de precios es la fuente de verdad (eventos append-only).
 * Esta función dobla un conjunto de filas de historial en el precio vigente para
 * un producto, sin depender del orden de sincronización ni de un snapshot
 * mutable (`productos.precioVentaActual`).
 *
 * Regla (determinista en cualquier aparato/servidor):
 *   1. Se consideran solo las filas "abiertas" (vigenteHasta == null).
 *   2. De ellas se elige la de mayor `vigenteDesde`.
 *   3. Si empatan `vigenteDesde`: mayor `actualizadoEn`, luego `id` lexicográfico.
 *
 * Si no hay ninguna fila abierta, devuelve `fallback` (el snapshot heredado),
 * para no romper produtos viejos antes de migrar.
 */
function aMs(valor) {
  if (valor == null) return 0
  if (valor instanceof Date) return valor.getTime()
  const n = Number(valor)
  if (Number.isFinite(n)) return n
  const p = Date.parse(String(valor))
  return Number.isFinite(p) ? p : 0
}

export function precioVigenteDeHistorial(filas, fallback = null) {
  const abiertas = (Array.isArray(filas) ? filas : []).filter(
    r => r && (r.vigenteHasta == null || r.vigenteHasta === '' || r.vigenteHasta == null)
  )
  if (!abiertas.length) return fallback

  let elegida = abiertas[0]
  for (const r of abiertas.slice(1)) {
    const cmpDesde = aMs(r.vigenteDesde) - aMs(elegida.vigenteDesde)
    if (cmpDesde > 0) {
      elegida = r
      continue
    }
    if (cmpDesde < 0) continue
    const cmpTs = aMs(r.actualizadoEn) - aMs(elegida.actualizadoEn)
    if (cmpTs > 0) {
      elegida = r
      continue
    }
    if (cmpTs < 0) continue
    if (String(r.id ?? '') > String(elegida.id ?? '')) elegida = r
  }

  const precio = elegida.precioVenta ?? elegida.precioVentaActual ?? fallback
  return precio == null ? fallback : Number(precio)
}

export function agruparPreciosVigentes(historial, fallbackPorProducto = {}) {
  const porProducto = new Map()
  for (const r of (Array.isArray(historial) ? historial : [])) {
    const pid = r?.productoId ?? r?.producto_id
    if (pid == null) continue
    if (!porProducto.has(pid)) porProducto.set(pid, [])
    porProducto.get(pid).push(r)
  }
  const out = {}
  for (const [pid, filas] of porProducto.entries()) {
    out[pid] = precioVigenteDeHistorial(filas, fallbackPorProducto?.[pid] ?? null)
  }
  return out
}
