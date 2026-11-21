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

function diaDeMs(valor) {
  const t = ms(valor)
  if (!t) return ''
  const d = new Date(t)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function enRangoDia(valor, inicio, fin) {
  const t = ms(valor)
  return t >= inicio && t <= fin
}

/**
 * Ganancia de un día, alineada con la gráfica "ganancia por período":
 * - día cerrado (hay cuadre cerrado de ese día) -> ganancia del cuadre;
 * - hoy con cuadre abierto -> fuera de cuadre (ventas directas + deudas directas
 *   + mermas), avisando que el cuadre está abierto;
 * - sin cuadre ni movimientos -> vacío.
 *
 * `cuadres` puede traer varios; se usa el cerrado del día, o el abierto si no hay
 * cerrado. `deudasDirectas` son cuentas fiado sin `cuadreOrigenId`.
 */
export function gananciaDelDia({
  fecha = null,
  cuadres = [],
  ventas = [],
  deudasDirectas = [],
  movimientos = [],
  ahora = Date.now(),
  desde = null,
  hasta = null
} = {}) {
  const inicio = desde ?? inicioDelDia(ahora)
  const fin = hasta ?? (inicio + 24 * 60 * 60 * 1000 - 1)
  const dia = fecha || diaDeMs(inicio)

  const delDia = (cuadres ?? []).filter(c => String(c?.fecha ?? '') === dia)
  const cerrados = delDia.filter(c => c?.estado === 'cerrado')
  if (cerrados.length) {
    // Misma regla que la gr�fica (filasGananciaCuadre): ganancia FIFO congelada
    // al cerrar menos el pago al trabajador.
    // Decisi�n Fase 3: cuadres viejos con ganancia == null NO se estiman con
    // precio de compra actual (la gr�fica s� lo hace por legado). MiQuiosco se
    // reinici� en v2.4.21; si aparecen, se omiten para no inventar cifras.
    let monto = 0
    for (const c of cerrados) {
      if (c?.ganancia == null) continue
      monto += Number(c.ganancia) || 0
      monto -= Number(c?.pagoTrabajador) || 0
    }
    return { origen: 'cuadre', monto: redondear2(monto), dia }
  }

  let fuera = 0
  let hayMovimientos = false
  for (const v of ventas ?? []) {
    if (v?.anulado || !enRangoDia(v?.creadoEn, inicio, fin)) continue
    fuera += Number(v?.ganancia) || 0
    hayMovimientos = true
  }
  for (const d of deudasDirectas ?? []) {
    if (d?.cuadreOrigenId || !enRangoDia(d?.creadoEn, inicio, fin)) continue
    fuera += Number(d?.ganancia) || 0
    hayMovimientos = true
  }
  for (const m of movimientos ?? []) {
    if (m?.anulado || m?.tipo !== 'merma' || !enRangoDia(m?.creadoEn, inicio, fin)) continue
    fuera -= Math.abs(Number(m?.importe) || 0)
    hayMovimientos = true
  }

  const abierto = delDia.find(c => c?.estado === 'abierto') ?? null
  if (abierto) {
    return { origen: 'abierto', monto: redondear2(fuera), dia }
  }
  if (hayMovimientos) {
    return { origen: 'fuera_de_cuadre', monto: redondear2(fuera), dia }
  }
  return { origen: 'vacio', monto: 0, dia }
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
export function resumirDia({ ventas = [], acciones = [], dictados = 0, ahora = Date.now(), desde = null, hasta = null, cuadres = null, deudasDirectas = null, movimientos = null } = {}) {
  const inicio = desde ?? inicioDelDia(ahora)
  const fin = hasta ?? (inicio + 24 * 60 * 60 * 1000 - 1)
  const delDia = (ventas ?? []).filter((v) => {
    if (v?.anulado) return false
    const t = ms(v?.creadoEn)
    return t >= inicio && t <= fin
  })
  let importeHoy = 0
  let gananciaVentas = 0
  for (const venta of delDia) {
    importeHoy += Number(venta?.montoTotal) || 0
    gananciaVentas += Number(venta?.ganancia) || 0
  }

  // Misma regla que `resumenPendientes`: caducadas no se cuentan.
  const vigentes = (acciones ?? []).filter(a => a && a.estado !== 'aplicada'
    && a.estado !== 'descartada' && a.estado !== 'caducada')
  let importePendiente = 0
  for (const a of vigentes) {
    importePendiente += Number(a.importe) || Number(a.precioUnitario) * Number(a.cantidad) || 0
  }

  const pendientes = vigentes.length + Math.max(0, Math.trunc(Number(dictados) || 0))
  const usarCuadre = cuadres !== null || deudasDirectas !== null || movimientos !== null
  const ganancia = usarCuadre
    ? gananciaDelDia({ cuadres: cuadres ?? [], ventas, deudasDirectas: deudasDirectas ?? [], movimientos: movimientos ?? [], ahora, desde: inicio, hasta: fin })
    : { origen: 'ventas', monto: redondear2(gananciaVentas), dia: diaDeMs(inicio) }

  return {
    ventasHoy: delDia.length,
    importeHoy: redondear2(importeHoy),
    gananciaHoy: ganancia.monto,
    gananciaOrigen: ganancia.origen,
    pendientes,
    importePendiente: redondear2(importePendiente),
    inicioDelDia: inicio
  }
}

/**
 * Respuesta hablada de la ganancia del día. Alineada con la gráfica:
 * - cuadre cerrado -> ganancia del cuadre;
 * - cuadre abierto -> avisa que está abierto y da la ganancia fuera de cuadre;
 * - sin datos -> no inventa.
 *
 * `cuando` etiqueta un día pasado («El martes 10 de noviembre»).
 */
export function formatearGanancia(resumen, { cuando = null } = {}) {
  const ventas = Math.trunc(Number(resumen?.ventasHoy) || 0)
  const importe = formatearMonto(resumen?.importeHoy)
  const ganancia = Number(resumen?.gananciaHoy) || 0
  const origen = String(resumen?.gananciaOrigen ?? 'ventas')
  const monto = formatearMonto(Math.abs(ganancia))
  const verbo = ganancia < 0 ? 'perdiste' : 'ganaste'
  const dia = cuando || 'Hoy'
  const hayDatos = ventas > 0 || origen === 'cuadre' || origen === 'fuera_de_cuadre' || origen === 'abierto'

  if (!hayDatos) {
    return {
      titulo: `${dia}: sin ganancia`,
      descripcion: 'Sin ventas registradas',
      habla: cuando
        ? `${cuando} no hubo ventas, así que no hay ganancia.`
        : 'Todavía no hay ventas hoy, así que no hay ganancia.',
      tipo: 'ganancia_vacia'
    }
  }

  if (origen === 'abierto') {
    return {
      titulo: `${dia}: cuadre abierto`,
      descripcion: `${monto} pesos fuera de cuadre`,
      habla: cuando
        ? `${cuando} el cuadre estaba abierto. Fuera de cuadre ${ganancia < 0 ? 'ibas en' : 'ibas en'} ${monto} pesos.`
        : `El cuadre de hoy está abierto. Fuera de cuadre vas ${monto} pesos.`,
      tipo: 'ganancia_abierta'
    }
  }

  const contexto = ventas > 0 ? ` de ${importe} vendidos` : ''
  return {
    titulo: `${dia}: ${verbo} ${monto} pesos`,
    descripcion: ventas > 0 ? `${monto} pesos · ${importe} vendidos` : `${monto} pesos`,
    habla: cuando
      ? `${cuando} ${verbo} ${monto} pesos${contexto}.`
      : `Hoy ${verbo} ${monto} pesos${contexto}.`,
    tipo: 'ganancia'
  }
}

const RE_DIA_SEMANA = /\b(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/
const RE_FECHA_DIA_MES = /\b\d{1,2}\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/
// «ayer» y «anteayer» son días concretos igual que «el martes»: sin ellos,
// «cuánto gané ayer» se quedaba en «consulta no soportada».
const RE_DIAS_RELATIVOS = /\b(ayer|anteayer|antiayer|antayer|antier)\b/

/** ¿La frase nombra un día concreto (de la semana, del calendario o relativo)? */
function mencionaFecha(frase) {
  return RE_DIA_SEMANA.test(frase) || RE_FECHA_DIA_MES.test(frase) || RE_DIAS_RELATIVOS.test(frase)
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

  const hablaDeVentas = /\b(vendi|vendimos|vendido|vendidos|vendiste|venta|ventas|llevo|llevamos|hice|he vendido)\b/.test(frase)
  const marcaDia = /\b(hoy|dia)\b/.test(frase) || mencionaFecha(frase)
  // «Cómo fue ayer» pregunta por el día sin nombrar ventas: el marcador de día
  // relativo ya dice de qué se habla.
  if (/\bcomo\s+(?:fue|estuvo)\b/.test(frase) && mencionaFecha(frase)) return true
  return hablaDeVentas && marcaDia
}
