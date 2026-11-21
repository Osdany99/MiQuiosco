/**
 * app/utils/relojServidor.js — Desfase entre el reloj del equipo y el servidor.
 *
 * POR QUÉ EXISTE
 * Cuba decidió no aplicar el cambio de hora (crisis eléctrica), pero muchos
 * teléfonos sí lo aplicaron: quedan una hora adelantados respecto a la hora
 * "real" del país. Para el servidor (y para Vercel, que va en UTC) ese
 * adelanto se ve como fecha futura.
 *
 * El instante de una escritura lo manda el servidor, no el aparato. Este
 * módulo guarda el desfase medido (servidor − equipo) y lo aplica a `Date.now()`.
 *
 * Es estado de módulo, sin Vue: lo leen también `server-offline` y los
 * composables de dominio, que no tienen por qué conocer refs.
 */

let desfaseMs = 0
/** Última medición (epoch del equipo) y quién la hizo, para diagnóstico. */
let medidoEn = 0
let mediciones = 0

/** Fija el desfase medido: `servidorMs − equipoMs` (positivo = el equipo atrasa). */
export function fijarDesfase(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || Math.abs(n) > 12 * 60 * 60 * 1000) return false
  desfaseMs = n
  medidoEn = Date.now()
  mediciones += 1
  return true
}

export function desfaseActual() {
  return desfaseMs
}

export function estadoReloj() {
  return { desfaseMs, medidoEn, mediciones }
}

/** Desfase en minutos redondeado, para mostrar en Ajustes. */
export function desfaseEnMinutos() {
  return Math.round(desfaseMs / 60000)
}

/**
 * "Ahora" según el servidor. Es lo que deben usar las escrituras locales
 * (`creadoEn`/`actualizadoEn`) y los cálculos de día de negocio.
 */
export function ahoraServidor() {
  return Date.now() + desfaseMs
}
