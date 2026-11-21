/**
 * shared/fechas.js — Única conversión de fechas a epoch ms de la app.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * El servidor entrega las marcas de tiempo como ISO-8601
 * (server/api/sync/pull.get.ts → serializeRow) y la BD local las guarda en
 * columnas `integer(..., { mode: 'timestamp_ms' })`. Ese ISO en aritmética es
 * veneno: `Number('2026-07-11T19:13:55.004Z')` es NaN, y un NaN que cruza el
 * bridge JSON hacia SQLite llega como NULL — de ahí el
 * "NOT NULL constraint failed: historial_precios.vigente_desde" al cambiar un
 * precio de venta, y el historial que nunca se escribe.
 *
 * Cualquier código que toque una fecha (aritmética, comparación o escritura
 * en SQLite) pasa por aquí en vez de hacer `Number(...)` a su antojo.
 */

/**
 * Epoch en milisegundos de una fecha que puede venir como número, Date o
 * ISO-8601. Sin fecha interpretable devuelve 0, que es el comportamiento
 * histórico de `aEpoch` en shared/inventario/operaciones.js.
 *
 * @param {number|string|Date|null|undefined} v
 * @returns {number}
 */
export function aEpoch(v) {
  if (v == null) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v instanceof Date) {
    const ms = v.getTime()
    return Number.isNaN(ms) ? 0 : ms
  }
  const n = Date.parse(String(v))
  return Number.isNaN(n) ? 0 : n
}

/**
 * Igual que {@link aEpoch} pero distingue "no hay fecha" (null) del propio
 * origen epoch (0). Lo usan los filtros por rango, donde un null debe
 * ignorar la fila en vez de compararla contra 0.
 *
 * @param {number|string|Date|null|undefined} v
 * @returns {number|null}
 */
export function aEpochOpcional(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v instanceof Date) {
    const ms = v.getTime()
    return Number.isNaN(ms) ? null : ms
  }
  const n = Date.parse(String(v))
  return Number.isNaN(n) ? null : n
}

/**
 * Normaliza en sitio las columnas marcadas como timestamp de una fila.
 * Se usa justo antes de escribir en SQLite: es donde el ISO que llega del
 * servidor se vuelve epoch ms, sin tocar las filas que ya son numéricas.
 *
 * Los valores que no son string (números ya convertidos) o que no parsean
 * se dejan tal cual: es preferible guardar un dato raro a inventar una fecha.
 *
 * @param {Record<string, any>} data fila en camelCase
 * @param {Iterable<string>} claves columnas de la tabla que son timestamp
 * @returns {Record<string, any>} la misma fila o una copia ya normalizada
 */
export function normalizarFechas(data, claves) {
  let out = data
  for (const clave of claves) {
    const valor = data[clave]
    if (typeof valor !== 'string') continue
    const ms = Date.parse(valor)
    if (Number.isNaN(ms)) continue
    if (out === data) out = { ...data }
    out[clave] = ms
  }
  return out
}

// ---------------------------------------------------------------------------
// Día de negocio
// ---------------------------------------------------------------------------

/**
 * Desfase horario del puesto respecto a UTC, en horas.
 *
 * NO se usa la zona IANA a propósito. El negocio está en Cuba y el país decidió
 * no aplicar el cambio de hora: su hora de pared se queda fija, pero las bases
 * tzdata (`America/Havana`) sí mueven `America/Havana` dos veces al año. Calcular
 * el día con una zona IANA devolvería la hora "oficial" y no la que ve el jefe
 * en el reloj de la pared. Un desfase fijo (UTC-5 por defecto, configurable con
 * `TZ_DESFASE_HORAS`) es determinista en el teléfono, en el portátil y en el
 * servidor, y no depende de que el aparato tenga la zona bien puesta.
 *
 * Debajo se usa `aEpoch`, así que acepta epoch ms, ISO o Date igual que el resto.
 */
export const TZ_DESFASE_HORAS = -5

/**
 * 'YYYY-MM-DD' del día de negocio de un instante: epoch + desfase fijo, leído
 * en UTC. Sin `Date.now()` propio y sin depender del reloj del aparato.
 *
 * @param {number|string|Date|null|undefined} v instante
 * @param {number} horasOffset desfase respecto a UTC (por defecto el del negocio)
 * @returns {string} '' si no hay instante interpretable
 */
export function diaEnOffset(v, horasOffset = TZ_DESFASE_HORAS) {
  const ms = aEpoch(v)
  if (!ms) return ''
  const d = new Date(ms + Number(horasOffset) * 60 * 60 * 1000)
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(d.getUTCDate()).padStart(2, '0')
  return `${d.getUTCFullYear()}-${mes}-${dia}`
}

/**
 * Diferencia en días de calendario entre dos días de negocio ('YYYY-MM-DD').
 * Negativo si `a` es anterior a `b`. Con `'2026-11-20'` y `'2026-11-21'` → -1.
 */
export function diasEntreDias(a, b) {
  if (!a || !b) return NaN
  const [ya, ma, da] = String(a).split('-').map(Number)
  const [yb, mb, db] = String(b).split('-').map(Number)
  const msA = Date.UTC(ya, ma - 1, da)
  const msB = Date.UTC(yb, mb - 1, db)
  return Math.round((msA - msB) / (24 * 60 * 60 * 1000))
}

// ---------------------------------------------------------------------------
// Reloj del servidor
// ---------------------------------------------------------------------------

/**
 * Tolerancia de reloj entre el teléfono y el servidor.
 *
 * Cuba no cambió la hora (decisión de gobierno por la crisis eléctrica), así
 * que un Android que sí recibió el cambio queda una hora adelantado. Un margen
 * de 60 s convertía eso en "fecha futura" y bloqueaba cada venta directa.
 *
 * ±2 h cubre cualquier desfase de zona horaria/DST sin abrir la puerta a fechas
 * inventadas: más allá de esto, el reloj del aparato está mal de verdad y es
 * mejor avisar que aceptar el dato a ciegas.
 */
export const MS_TOLERANCIA_RELOJ = 2 * 60 * 60 * 1000

/**
 * Margen para no recortar por el viaje de la petición ni por la deriva normal
 * de un reloj en hora: dentro de este minuto, la hora del cliente se respeta.
 */
export const MS_GRACIA_FUTURO = 60 * 1000

/**
 * Instante de una escritura según el cliente, acotado al reloj del servidor.
 *
 * Reglas, en orden:
 * 1. Sin fecha (o fecha ilegible) → hora del servidor.
 * 2. Fecha en el pasado → se respeta tal cual: la cola de voz necesita que una
 *    venta dictada ayer quede en su día.
 * 3. Fecha por delante del servidor, dentro del minuto de gracia → se respeta
 *    (es el viaje de la petición).
 * 4. Fecha por delante dentro de la tolerancia (±2 h) → se recorta al instante
 *    del servidor. Un teléfono adelantado no puede fechar nada en el futuro, ni
 *    una venta ni un lote: eso rompe el día de negocio y el FIFO.
 * 5. Fecha por delante más allá de la tolerancia → se marca
 *    `fueraDeTolerancia` para que el endpoint lo rechace con un mensaje claro.
 *
 * @param {number|string|Date|null|undefined} pedido instante que manda el cliente
 * @param {number} ahoraServidorMs instante del servidor
 * @param {object} [opts]
 * @param {number} [opts.toleranciaMs] margen duro por delante
 * @returns {{ ms: number, ajustado: boolean, fueraDeTolerancia: boolean }}
 */
export function instanteConfiable(
  pedido,
  ahoraServidorMs,
  { toleranciaMs = MS_TOLERANCIA_RELOJ } = {}
) {
  const ahora = Number(ahoraServidorMs) || 0
  const ms = aEpochOpcional(pedido)
  if (ms == null || ms <= 0) return { ms: ahora, ajustado: false, fueraDeTolerancia: false }
  if (ms <= ahora + MS_GRACIA_FUTURO) return { ms, ajustado: false, fueraDeTolerancia: false }
  if (ms > ahora + toleranciaMs) {
    return { ms: ahora, ajustado: true, fueraDeTolerancia: true }
  }
  return { ms: ahora, ajustado: true, fueraDeTolerancia: false }
}

/**
 * ¿La fecha 'YYYY-MM-DD' es un día de negocio plausible?
 *
 * Se usa para las fechas sin hora (fechaEntrada de un lote, fecha de un
 * traspaso). Solo mira el FUTURO: una compra se puede anotar tarde (una factura
 * de la semana pasada que se registra hoy), así que el pasado es legítimo y lo
 * elige el jefe a mano. Lo que no puede pasar es fechar mercancía en el futuro:
 * rompe el FIFO y los reportes de compras.
 *
 * - Hoy o pasado → válida.
 * - Un día por delante → es el teléfono adelantado cruzando el día a las 23:00,
 *   así que se devuelve el día del servidor para que el llamador lo corrija.
 * - Más de un día por delante → no se corrige: se rechaza, porque ya no es un
 *   desfase de reloj de una hora.
 *
 * @param {string} dia 'YYYY-MM-DD'
 * @param {number} ahoraServidorMs instante del servidor
 * @param {object} [opts] { horasOffset }
 * @returns {{ ok: boolean, diaAjustado: string|null, motivo: string|null }}
 */
export function diaNegocioPlausible(dia, ahoraServidorMs, { horasOffset = TZ_DESFASE_HORAS } = {}) {
  const hoy = diaEnOffset(ahoraServidorMs, horasOffset)
  if (!dia || !hoy) return { ok: false, diaAjustado: null, motivo: 'Fecha inválida.' }
  const delta = diasEntreDias(dia, hoy)
  if (!Number.isFinite(delta)) return { ok: false, diaAjustado: null, motivo: 'Fecha inválida.' }
  if (delta > 1) {
    return {
      ok: false,
      diaAjustado: null,
      motivo: 'La fecha está en el futuro: revisa la hora del equipo.'
    }
  }
  if (delta === 1) {
    // Un solo día por delante es la firma del reloj adelantado (cruzar de día
    // una hora antes). Se corrige al día del servidor, no se rechaza.
    return {
      ok: false,
      diaAjustado: hoy,
      motivo: 'La fecha está adelantada un día: se anota en la fecha del servidor.'
    }
  }
  return { ok: true, diaAjustado: null, motivo: null }
}
