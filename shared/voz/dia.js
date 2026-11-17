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
 * @param {number|null} opciones.desde Inicio del rango (ms). Sin él, hoy.
 * @param {number|null} opciones.hasta Fin del rango (ms). Sin él, el día completo.
 */
export function resumirDia({ ventas = [], acciones = [], dictados = 0, ahora = Date.now(), desde = null, hasta = null } = {}) {
  const inicio = desde ?? inicioDelDia(ahora)
  const fin = hasta ?? (inicio + 24 * 60 * 60 * 1000 - 1)
  const delDia = (ventas ?? []).filter((v) => {
    if (v?.anulado) return false
    const t = ms(v?.creadoEn)
    return t >= inicio && t <= fin
  })
  let importeHoy = 0
  let gananciaHoy = 0
  for (const venta of delDia) {
    importeHoy += Number(venta?.montoTotal) || 0
    gananciaHoy += Number(venta?.ganancia) || 0
  }

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
    gananciaHoy: redondear2(gananciaHoy),
    pendientes,
    importePendiente: redondear2(importePendiente),
    inicioDelDia: inicio
  }
}

/**
 * Respuesta hablada de la ganancia del día. Se dice junto al importe vendido;
 * si no hubo ventas, se admite que no hay ganancia que calcular.
 *
 * `cuando` es la etiqueta del día cuando no es hoy («El martes 10 de noviembre»).
 */
export function formatearGanancia(resumen, { cuando = null } = {}) {
  const ventas = Math.trunc(Number(resumen?.ventasHoy) || 0)
  const importe = formatearMonto(resumen?.importeHoy)
  const ganancia = Number(resumen?.gananciaHoy) || 0
  const monto = formatearMonto(Math.abs(ganancia))
  const verbo = ganancia < 0 ? 'perdiste' : 'ganaste'
  const dia = cuando || 'Hoy'

  if (ventas === 0) {
    return {
      titulo: `${dia}: sin ganancia`,
      descripcion: 'Sin ventas registradas',
      habla: cuando
        ? `${cuando} no hubo ventas, así que no hay ganancia.`
        : 'Todavía no hay ventas hoy, así que no hay ganancia.',
      tipo: 'ganancia_vacia'
    }
  }

  return {
    titulo: `${dia}: ${verbo} ${monto} pesos`,
    descripcion: `${monto} pesos · ${importe} vendidos`,
    habla: cuando
      ? `${cuando} ${verbo} ${monto} pesos de ${importe} vendidos.`
      : `Hoy ${verbo} ${monto} pesos de ${importe} vendidos.`,
    tipo: 'ganancia'
  }
}

const RE_DIA_SEMANA = /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/
const RE_FECHA_DIA_MES = /\b\d{1,2}\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/

/** ¿La frase nombra un día concreto (de la semana o del calendario)? */
function mencionaFecha(frase) {
  return RE_DIA_SEMANA.test(frase) || RE_FECHA_DIA_MES.test(frase)
}

/**
 * ¿La frase pide la ganancia del día? Exige una marca de día como el resumen:
 * «cuánto gané» a secas puede ser de otro día o de una venta concreta.
 */
export function esConsultaGanancia(texto) {
  const frase = normalizarFraseVoz(texto)
  if (!frase) return false
  const hablaDeGanancia = /\b(gane|ganamos|ganancia|ganancias|utilidad|utilidades)\b/.test(frase)
  if (!hablaDeGanancia) return false
  return /\b(hoy|dia)\b/.test(frase) || frase.startsWith('ganancia') || mencionaFecha(frase)
}

/**
 * Respuesta hablada del resumen del día. El texto es el mismo que produce el
 * servicio nativo: si cambia aquí, hay que cambiar `VozEscuchaService`.
 *
 * `cuando` etiqueta un día pasado («El martes 10 de noviembre»); sin él, es hoy.
 */
export function formatearDia(resumen, { cuando = null } = {}) {
  const ventas = Math.trunc(Number(resumen?.ventasHoy) || 0)
  const importe = formatearMonto(resumen?.importeHoy)
  const pendientes = Math.trunc(Number(resumen?.pendientes) || 0)
  const plural = (n, uno, varios) => (n === 1 ? uno : varios)
  const dia = cuando || 'Hoy'

  if (ventas === 0) {
    const base = cuando
      ? `${cuando} no hubo ventas.`
      : (pendientes > 0
          ? `Todavía no hay ventas hoy. Hay ${pendientes} ${plural(pendientes, 'dictado', 'dictados')} por revisar.`
          : 'Todavía no hay ventas hoy.')
    return {
      titulo: `${dia}: sin ventas`,
      descripcion: pendientes > 0 ? `${pendientes} por revisar` : 'Sin ventas registradas',
      habla: base,
      tipo: pendientes > 0 ? 'dia_con_pendientes' : 'dia_vacio'
    }
  }

  const cuerpo = `${ventas} ${plural(ventas, 'venta', 'ventas')} por ${importe} pesos`
  const cabecera = cuando ? `${cuando}: ${cuerpo}` : `Hoy: ${cuerpo}`
  const cola = pendientes > 0 && !cuando
    ? `. ${pendientes} ${plural(pendientes, 'dictado', 'dictados')} por revisar.`
    : '.'

  return {
    titulo: `${dia}: ${ventas} ${plural(ventas, 'venta', 'ventas')} · ${importe} pesos`,
    descripcion: pendientes > 0
      ? `${importe} pesos vendidos · ${pendientes} por revisar`
      : `${importe} pesos vendidos`,
    habla: `${cabecera}${cola}`,
    tipo: 'dia'
  }
}

/** Forma canónica de una frase dictada: sin tildes, minúsculas y sin signos. */
function normalizarFraseVoz(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * ¿La frase pide el resumen del día? Exige una marca de día («hoy», «del día»)
 * o una de las preguntas fijas: «cuánto vendí» a secas puede ser de otro día.
 *
 * «ganancia», «costo» y «caja» quedan fuera: necesitan otros datos y una cifra
 * inventada sería peor que el silencio.
 */
export function esConsultaDia(texto) {
  const frase = normalizarFraseVoz(texto)
  if (!frase) return false
  if (/\b(ganancia|ganancias|gane|costo|costos|inversion|invertido)\b/.test(frase)) return false

  const fijas = [
    'como va el dia', 'como va la venta', 'como va el negocio', 'como va todo',
    'como vamos hoy', 'resumen del dia', 'cierre del dia', 'resumen de hoy'
  ]
  if (fijas.some(f => frase === f || frase.startsWith(`${f} `))) return true

  const hablaDeVentas = /\b(vendi|vendimos|vendido|vendidos|vendiste|venta|ventas|llevo|llevamos)\b/.test(frase)
  const marcaDia = /\b(hoy|dia)\b/.test(frase) || mencionaFecha(frase)
  return hablaDeVentas && marcaDia
}
