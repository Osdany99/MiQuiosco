/**
 * shared/voz/dia.js — resumen del día por voz (puro).
 *
 * Un solo cálculo para los dos lados:
 * - app abierta: `useVentaPorVoz` lo responde en el momento;
 * - app cerrada: el snapshot guarda el mismo resumen y el servicio nativo solo
 *   lo lee (`VozEscuchaService.responderConsulta`).
 *
 * Sin Vue, sin Capacitor y sin base de datos: se prueba con `node --test`.
 */

/** Inicio del día local en epoch ms. */
export function inicioDelDia(ahora = Date.now()) {
  const d = new Date(ahora)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Importe para leer en voz alta: "845" o "845,50" (coma decimal). */
export function formatearMonto(valor) {
  const n = Math.round((Number(valor) || 0) * 100) / 100
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',')
}

/** Epoch ms tolerante: SQLite guarda números, el servidor puede mandar ISO. */
function ms(valor) {
  if (valor == null) return 0
  if (typeof valor === 'number') return valor
  const n = Number(valor)
  if (Number.isFinite(n)) return n
  const parsed = Date.parse(String(valor))
  return Number.isNaN(parsed) ? 0 : parsed
}

function redondear2(valor) {
  return Math.round((Number(valor) || 0) * 100) / 100
}

/**
 * Resumen de hoy: ventas directas del día y dictados por revisar.
 *
 * Las ventas anuladas no cuentan. Las pendientes tampoco: todavía no se han
 * aplicado, así que se informan aparte (no suman al importe vendido).
 *
 * @param {object} opciones
 * @param {Array} opciones.ventas Ventas directas (`ventas_directas`).
 * @param {Array} opciones.acciones Acciones pendientes de revisión.
 * @param {Array} opciones.dictados Dictados del buzón nativo aún sin recoger.
 * @param {number} opciones.ahora
 */
export function resumirDia({ ventas = [], acciones = [], dictados = 0, ahora = Date.now() } = {}) {
  const desde = inicioDelDia(ahora)
  const delDia = (ventas ?? []).filter(v => !v?.anulado && ms(v?.creadoEn) >= desde)
  let importeHoy = 0
  for (const venta of delDia) importeHoy += Number(venta?.montoTotal) || 0

  // Misma regla que `resumenPendientes`: caducadas no se cuentan.
  const vigentes = (acciones ?? []).filter(a => a && a.estado !== 'aplicada'
    && a.estado !== 'descartada' && a.estado !== 'caducada')
  let importePendiente = 0
  for (const a of vigentes) {
    importePendiente += Number(a.importe) || Number(a.precioUnitario) * Number(a.cantidad) || 0
  }

  const pendientes = vigentes.length + Math.max(0, Math.trunc(Number(dictados) || 0))

  return {
    ventasHoy: delDia.length,
    importeHoy: redondear2(importeHoy),
    pendientes,
    importePendiente: redondear2(importePendiente),
    inicioDelDia: desde
  }
}

/**
 * Respuesta hablada del resumen del día. El texto es el mismo que produce el
 * servicio nativo: si cambia aquí, hay que cambiar `VozEscuchaService`.
 */
export function formatearDia(resumen) {
  const ventas = Math.trunc(Number(resumen?.ventasHoy) || 0)
  const importe = formatearMonto(resumen?.importeHoy)
  const pendientes = Math.trunc(Number(resumen?.pendientes) || 0)
  const plural = (n, uno, varios) => (n === 1 ? uno : varios)

  if (ventas === 0) {
    const base = pendientes > 0
      ? `Todavía no hay ventas hoy. Hay ${pendientes} ${plural(pendientes, 'dictado', 'dictados')} por revisar.`
      : 'Todavía no hay ventas hoy.'
    return {
      titulo: 'Hoy: sin ventas',
      descripcion: pendientes > 0 ? `${pendientes} por revisar` : 'Sin ventas registradas',
      habla: base,
      tipo: pendientes > 0 ? 'dia_con_pendientes' : 'dia_vacio'
    }
  }

  const cabecera = `Hoy: ${ventas} ${plural(ventas, 'venta', 'ventas')} por ${importe} pesos`
  const cola = pendientes > 0
    ? `. ${pendientes} ${plural(pendientes, 'dictado', 'dictados')} por revisar.`
    : '.'

  return {
    titulo: `Hoy: ${ventas} ${plural(ventas, 'venta', 'ventas')} · ${importe} pesos`,
    descripcion: pendientes > 0
      ? `${importe} pesos vendidos · ${pendientes} por revisar`
      : `${importe} pesos vendidos`,
    habla: `${cabecera}${cola}`,
    tipo: 'dia'
  }
}

/**
 * ¿La frase pide el resumen del día? Exige una marca de día («hoy», «del día»)
 * o una de las preguntas fijas: «cuánto vendí» a secas puede ser de otro día.
 *
 * «ganancia», «costo» y «caja» quedan fuera: necesitan otros datos y una cifra
 * inventada sería peor que el silencio.
 */
export function esConsultaDia(texto) {
  const frase = String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  if (!frase) return false
  if (/\b(ganancia|ganancias|gane|costo|costos|inversion|invertido)\b/.test(frase)) return false

  const fijas = [
    'como va el dia', 'como va la venta', 'como va el negocio', 'como va todo',
    'como vamos hoy', 'resumen del dia', 'cierre del dia', 'resumen de hoy'
  ]
  if (fijas.some(f => frase === f || frase.startsWith(`${f} `))) return true

  const hablaDeVentas = /\b(vendi|vendimos|vendido|vendidos|vendiste|venta|ventas|llevo|llevamos)\b/.test(frase)
  const marcaDia = /\b(hoy|dia)\b/.test(frase)
  return hablaDeVentas && marcaDia
}
