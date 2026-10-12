/**
 * shared/inventario/capacidad.js — Capacidad de venta de un cuadre, sin Vue ni DB.
 *
 * La CAPACIDAD es cuánto había disponible para vender ese día: el stock con el
 * que arrancó más todo lo que entró y salió del quiosco durante el día. Quedan
 * fuera las ventas del propio cuadre, que son justo lo que la línea compara.
 *
 * Por eso cerrar el cuadre NO baja el número:
 *
 *   10 panes, se venden 6 y se cierra → quedan 4 en el quiosco, pero la
 *   capacidad sigue siendo 10 y 6 <= 10 no se marca en rojo.
 *
 * El rojo que ve el jefe al revisar un cuadre cerrado comparaba lo vendido
 * contra lo que QUEDABA, que es un número de otra pantalla (/quiosco).
 *
 * Cálculo, por producto:
 *
 *   netoDesde(D)    = Σ deltaQuiosco de movimientos con fechaNegocio >= D
 *   stockAlInicio   = stockActual - netoDesde(D)
 *   capacidad       = stockAlInicio + Σ deltaQuiosco de los PASOS
 *
 * `netoDesde` va desde el día del cuadre y no hasta él: el stock con el que
 * arranca el día es el que había al cerrarse el día anterior, o sea, el actual
 * menos todo lo que se movió desde entonces (ventas incluidas).
 *
 * Reabre bien porque la reapertura mete contramovimientos (tipo 'anulacion'):
 * al sumar en neto, la venta y su anulación se cancelan solas.
 */
import { aDia, indiceFechasNegocio } from './analitica.js'

/** Fecha y hora de un movimiento en epoch ms, tolerancia a null. */
function ms(v) {
  const n = typeof v === 'number' ? v : new Date(v ?? 0).getTime()
  return Number.isFinite(n) ? n : 0
}

/**
 * Clave que agrupa los movimientos de una MISMA operación. Todos los
 * constructores pasan un único meta.ahora, así que los movimientos de una
 * operación comparten creadoEn: sirve de respaldo cuando no hay un id propio
 * (merma y devolución son de un solo clic, sin cabecera que las agrupe).
 */
function claveGrupo(m) {
  if (m.traspasoId) return `traspaso:${m.traspasoId}`
  if (m.ventaDirectaId) return `ventaDirecta:${m.ventaDirectaId}`
  return `${m.tipo}:${ms(m.creadoEn)}`
}

/** Cómo se lee cada tipo de movimiento en el diálogo. */
const ETIQUETAS = {
  traspaso: { etiqueta: 'Repuesto desde el almacén', signo: 1 },
  devolucion: { etiqueta: 'Devuelto al almacén', signo: -1 },
  merma: { etiqueta: 'Merma', signo: -1 },
  venta: { etiqueta: 'Venta directa', signo: -1 }
}

/**
 * Capacidad de venta por producto para un cuadre.
 *
 * @param {object} p
 * @param {Array} p.movimientos — libro completo (no anulados ya filtrados o no)
 * @param {Array} p.cuadres — para saber la fecha de negocio de cada venta
 * @param {Array} p.lotes — idem para las entradas
 * @param {Array} p.traspasos — idem para las reposiciones
 * @param {Map|Array} p.saldos — stock actual por producto. Acepta el Map de
 *   saldosPorProducto() o el array de filas de vistaSaldos().
 * @param {string} p.fechaCuadre — 'YYYY-MM-DD' del cuadre
 * @param {string} [p.cuadreId] — las ventas de ESTE cuadre no son un paso
 * @param {boolean} [p.cerrado] — si está cerrado, el desglose se congela
 * @param {number|string} [p.cerradoEn] — corte de los pasos cuando está cerrado
 * @returns {Map<string, { inicial:number, capacidad:number, pasos:Array }>}
 */
export function capacidadDelCuadre({
  movimientos = [],
  cuadres = [],
  lotes = [],
  traspasos = [],
  saldos = new Map(),
  fechaCuadre,
  cuadreId = null,
  cerrado = false,
  cerradoEn = null
} = {}) {
  if (!fechaCuadre) return new Map()

  // Un repo devuelve { data, error }, no un array. Si eso se cuela hasta aquí,
  // el fallo sale como "x.map is not a function" en la línea 90, sin rastro de
  // que la causa fue un readAll sin desenvolver. Se normaliza en la puerta.
  const lista = v => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : [])
  const movs = lista(movimientos)
  const cuadresDelPuesto = lista(cuadres)
  const loteList = lista(lotes)
  const traspasoList = lista(traspasos)

  const diaCuadre = aDia(fechaCuadre)
  const fechas = indiceFechasNegocio({
    movimientos: movs,
    cuadres: cuadresDelPuesto,
    lotes: loteList,
    traspasos: traspasoList
  })

  // Cuadre cerrado = historia cerrada. Sus pasos se cortan en cerradoEn para que
  // un traspaso o una venta posterior NO reescriban un cuadre ya cerrado.
  // La condición va sobre el estado y no sobre cerradoEn porque reabrirCuadre no
  // borra ese timestamp: un cuadre reabierto lo conserva y filtrar por él dejaría
  // fuera lo que se repuso durante la reapertura.
  const corte = cerrado ? ms(cerradoEn) : null

  const netos = new Map()
  const grupos = new Map()

  for (const m of movs) {
    if (m.anulado) continue
    const productoId = m.productoId
    if (!productoId) continue
    const dia = fechas.get(m.id) || aDia(m.creadoEn)
    if (!dia) continue

    const delta = Math.trunc(Number(m.deltaQuiosco) || 0)

    // 1) Acumulado DESDE el día del cuadre (incluido). El stock con el que
    //    arrancó el día es el que había al cerrarse el día anterior, y se saca
    //    restando del actual TODO lo que se movió desde entonces.
    if (dia >= diaCuadre) {
      netos.set(productoId, (netos.get(productoId) ?? 0) + delta)
    }
    if (dia !== diaCuadre || delta === 0) continue
    if (corte != null && ms(m.creadoEn) > corte) continue

    // 2) Lo que el cuadre está excluyendo: su propia venta y la anulación de
    //    una reapertura. No son un paso, son justamente lo que se compara.
    if (cuadreId && m.cuadreId === cuadreId) continue

    const clave = claveGrupo(m)
    if (!grupos.has(productoId)) grupos.set(productoId, new Map())
    const delProducto = grupos.get(productoId)
    let paso = delProducto.get(clave)
    if (!paso) {
      const info = ETIQUETAS[m.tipo] ?? { etiqueta: 'Movimiento', signo: delta < 0 ? -1 : 1 }
      paso = {
        clave,
        tipo: m.tipo,
        etiqueta: info.etiqueta,
        delta: 0,
        cantidad: 0,
        precioUnitario: Number(m.precioUnitario) || 0,
        motivo: m.motivo ?? null,
        nota: m.nota ?? null,
        usuarioId: m.usuarioId ?? null,
        loteId: m.loteId ?? null,
        creadoEn: ms(m.creadoEn)
      }
      delProducto.set(clave, paso)
    }
    paso.delta += delta
    paso.cantidad += Math.trunc(Number(m.cantidad) || 0)
  }

  const saldosMap = saldos instanceof Map
    ? saldos
    : new Map((saldos ?? []).map(f => [f.productoId, f]))

  const stockDe = productoId => Number(saldosMap.get(productoId)?.quiosco) || 0

  // Un producto que no se movió desde el día del cuadre tampoco tiene por qué
  // estar en los movimientos: entra por su saldo, o se quedaría sin capacidad
  // justo cuando es el caso fácil (nada se movió, la capacidad es el stock).
  const ids = new Set([...netos.keys(), ...grupos.keys()])
  for (const [productoId] of saldosMap) ids.add(productoId)

  const salida = new Map()

  for (const productoId of ids) {
    // Clamp a 0: si algún saldo quedó descuadrado por datos viejos, mostrar un
    // negativo en la pantalla del jefe sería peor que mentir un poco.
    const inicial = Math.max(0, stockDe(productoId) - (netos.get(productoId) ?? 0))

    const pasos = [...(grupos.get(productoId)?.values() ?? [])]
      .filter(p => p.delta !== 0)
      .sort((a, b) => a.creadoEn - b.creadoEn)

    const movimiento = pasos.reduce((s, p) => s + p.delta, 0)
    salida.set(productoId, {
      inicial,
      capacidad: inicial + movimiento,
      pasos
    })
  }

  return salida
}
