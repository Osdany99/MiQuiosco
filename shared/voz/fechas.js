/**
 * shared/voz/fechas.js — «del martes», «del 1 de enero» (puro).
 *
 * Una consulta de ganancia o de ventas puede pedir un día concreto. Aquí se
 * convierte lo dicho en un rango de un día, con reglas explícitas:
 *
 * - **Ayer / anteayer** → los dos días anteriores al día de negocio. Se calculan
 *   con el desfase fijo del negocio (`shared/fechas.js`), no con la zona del
 *   aparato: a las 11 de la noche el teléfono y el reloj de la pared no
 *   siempre están de acuerdo, y «cuánto gané ayer» tiene que hablar del día que
 *   el jefe llama ayer.
 * - **Día de la semana** → el más reciente YA PASADO. Si hoy es martes, «el
 *   martes» es el de la semana pasada (no hoy).
 * - **Día y mes** → ese día del año en curso; si aún no ha llegado, del año
 *   anterior.
 *
 * Sin Vue y sin datos: se prueba con `node --test`.
 */
import { TZ_DESFASE_HORAS, diaEnOffset } from '../fechas.js'

const DIAS = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6
}

const MESES = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
}

const NOMBRES_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function sinTildes(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inicioDelDia(ms) {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const MS_DIA = 24 * 60 * 60 * 1000

/**
 * Rango de un día de negocio: desde la medianoche del negocio hasta la última
 * milésima. A diferencia de `rangoDeIso`, no depende de la zona del aparato.
 */
export function rangoDeDiaNegocio(iso, horasOffset = TZ_DESFASE_HORAS) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const inicio = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    - Number(horasOffset) * 60 * 60 * 1000
  if (!Number.isFinite(inicio)) return null
  return {
    iso,
    inicio,
    hasta: inicio + MS_DIA - 1,
    etiqueta: etiquetaDeDiaNegocio(iso)
  }
}

/** «El martes 10 de noviembre» a partir del ISO, con el día de la semana. */
function etiquetaDeDiaNegocio(iso) {
  const [anio, mes, dia] = String(iso).split('-').map(Number)
  const dow = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay()
  return `El ${NOMBRES_DIA[dow]} ${dia} de ${NOMBRES_MES[mes - 1]}`
}

/**
 * Convierte lo dictado en el día al que se refiere.
 *
 * @param {string} texto «dime la ganancia del martes», «las ventas del 1 de enero»
 * @param {{ahora?: number, horasOffset?: number}} opciones inyectable para pruebas
 * @returns {{iso: string, inicio: number, hasta: number, etiqueta: string}|null}
 */
export function resolverFechaDictada(texto, { ahora = Date.now(), horasOffset = TZ_DESFASE_HORAS } = {}) {
  const t = sinTildes(texto)
  if (!t) return null

  // «Ayer» y «anteayer» se cuentan sobre el día de negocio, no sobre el día
  // local del aparato.
  const relativo = RELATIVOS.find(r => r.patron.test(t))
  if (relativo) {
    const iso = restarDias(diaDeNegocio(ahora, horasOffset), relativo.dias)
    const rango = rangoDeDiaNegocio(iso, horasOffset)
    return rango ? { ...rango, etiqueta: relativo.etiqueta } : null
  }

  const hoy = inicioDelDia(ahora)

  const diaSemana = Object.keys(DIAS).find(nombre => new RegExp(`\\b${nombre}\\b`).test(t))
  if (diaSemana) {
    const objetivo = DIAS[diaSemana]
    const actual = new Date(hoy).getDay()
    // Semana pasada si es hoy mismo: «el martes» nunca es hoy.
    const atras = ((actual - objetivo + 7) % 7) || 7
    return construir(hoy - atras * MS_DIA)
  }

  const conMes = t.match(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)\b/)
  if (conMes && MESES[conMes[2]] != null) {
    const dia = Number(conMes[1])
    const mes = MESES[conMes[2]]
    const anio = new Date(hoy).getFullYear()
    const deEsteAnio = construirFecha(anio, mes, dia)
    if (!deEsteAnio) return null
    // La fecha de este año que aún no llegó se refiere a la del año pasado.
    if (deEsteAnio > hoy) {
      const anterior = construirFecha(anio - 1, mes, dia)
      return anterior ? construir(anterior) : null
    }
    return construir(deEsteAnio)
  }

  return null
}

function construirFecha(anio, mes, dia) {
  const d = new Date(anio, mes, dia)
  // 31 de febrero → el Date se desborda al mes siguiente: se descarta.
  if (d.getFullYear() !== anio || d.getMonth() !== mes || d.getDate() !== dia) return null
  return d.getTime()
}

function construir(inicio) {
  const fecha = new Date(inicio)
  const dow = fecha.getDay()
  const dia = fecha.getDate()
  const mes = fecha.getMonth()
  const etiqueta = `El ${NOMBRES_DIA[dow]} ${dia} de ${NOMBRES_MES[mes]}`
  const iso = `${fecha.getFullYear()}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
  return { iso, inicio, hasta: inicio + MS_DIA - 1, etiqueta }
}

/** 'YYYY-MM-DD' menos n días, en aritmética de calendario (sin zona horaria). */
function restarDias(iso, n) {
  const [anio, mes, dia] = String(iso).split('-').map(Number)
  const t = Date.UTC(anio, mes - 1, dia) - n * MS_DIA
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * «Ayer» y sus parientes del habla cubana. El orden importa: «anteayer» se
 * comprueba antes que «ayer» para que no lo tape.
 */
const RELATIVOS = [
  { patron: /\b(anteayer|antiayer|antayer|antier)\b/, dias: 2, etiqueta: 'Anteayer' },
  { patron: /\bayer\b/, dias: 1, etiqueta: 'Ayer' }
]

/** El día de negocio de un instante, sin depender de la zona del aparato. */
export function diaDeNegocio(ahora = Date.now(), horasOffset = TZ_DESFASE_HORAS) {
  return diaEnOffset(ahora, horasOffset)
}

/**
 * El rango de un día a partir de su ISO (`2026-11-10`). Se usa al ejecutar, para
 * no depender del reloj entre el dictado y la respuesta.
 */
export function rangoDeIso(iso) {
  const m = String(iso ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const inicio = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  if (!Number.isFinite(inicio)) return null
  return construir(inicio)
}
