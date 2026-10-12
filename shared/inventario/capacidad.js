/**
 * shared/inventario/capacidad.js — Capacidad de venta, sin Vue ni DB.
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
 *
 * Dos funciones, una sola matemática:
 *
 *   capacidadDelMes()    — un rango de días (el historial del quiosco)
 *   capacidadDelCuadre() — UN día, delegando en la anterior (el "Q:N" del
 *                          cuadre): es lo que garantiza que las dos vistas no
 *                          puedan dar números distintos
 *
 * Con una fecha de cuadre inválida capacidadDelCuadre() devuelve un mapa vacío:
 * no hay día del que sacar una capacidad, y antes se sacaba una comparando
 * fechas contra un texto sin sentido.
 */
import { aDia, diasDelRango, indiceFechasNegocio } from './analitica.js'

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
 * Capacidad de venta de TODOS los días de un rango, por producto.
 *
 * Es el mismo cálculo de capacidadDelCuadre(), extendido a manyos días: el
 * cuadre es un día, el historial del quiosco es un mes. Vive aquí y no en dos
 * sitios a propósito: si la matemática se duplicara, un día el desglose del
 * cuadre y el de la vista mensual dirían números distintos y nadie sabría
 * cuál miente.
 *
 * Que los días del rango se encadenen solos es lo que hace útil la vista: la
 * capacidad del lunes sale de la del domingo (menos lo vendido, más lo repuesto),
 * sin que nadie tenga que arrastrar un saldo a mano.
 *
 * @param {object} p
 * @param {Array} p.movimientos — libro completo (no anulados ya filtrados o no)
 * @param {Array} p.cuadres — para saber la fecha de negocio de cada venta
 * @param {Array} p.lotes — idem para las entradas
 * @param {Array} p.traspasos — idem para las reposiciones
 * @param {Map|Array} p.saldos — stock actual por producto. Acepta el Map de
 *   saldosPorProducto() o el array de filas de vistaSaldos().
 * @param {string} p.desde — 'YYYY-MM-DD', inclusive
 * @param {string} p.hasta — 'YYYY-MM-DD', inclusive
 * @param {Map<string,object>} [p.cuadrePorDia] — cuadre vigente de cada día.
 *   Por defecto se deduce de `cuadres` (gana el de actualización más reciente,
 *   que es como se resuelve un día con dos cuadres). El que se le pase manda:
 *   quien ya tiene el cuadre en la mano no quiere que se lo recalculen.
 * @returns {Map<string, Map<string, { inicial:number, capacidad:number, pasos:Array, cuadreId:string|null }>>}
 *   Por producto, cada día del rango (ambos extremos incluidos).
 */
export function capacidadDelMes({
  movimientos = [],
  cuadres = [],
  lotes = [],
  traspasos = [],
  saldos = new Map(),
  desde,
  hasta,
  cuadrePorDia: cuadrePorDiaForzado = null
} = {}) {
  const dias = diasDelRango(desde, hasta)
  const salida = new Map()
  if (!dias.length) return salida

  // Un repo devuelve { data, error }, no un array. Si eso se cuela hasta aquí,
  // el fallo sale como "x.map is not a function" más abajo, sin rastro de que
  // la causa fue un readAll sin desenvolver. Se normaliza en la puerta.
  const lista = v => (Array.isArray(v) ? v : Array.isArray(v?.data) ? v.data : [])
  const movs = lista(movimientos)
  const cuadresDelPuesto = lista(cuadres)
  const loteList = lista(lotes)
  const traspasoList = lista(traspasos)

  const fechas = indiceFechasNegocio({
    movimientos: movs,
    cuadres: cuadresDelPuesto,
    lotes: loteList,
    traspasos: traspasoList
  })

  const diaDesde = dias[0]
  const diaHasta = dias[dias.length - 1]

  // Cuadre cerrado = historia cerrada. Sus pasos se cortan en cerradoEn para que
  // un traspaso o una venta posterior NO reescriban un cuadre ya cerrado.
  // La condición va sobre el estado y no sobre cerradoEn porque reabrirCuadre no
  // borra ese timestamp: un cuadre reabierto lo conserva y filtrar por él dejaría
  // fuera lo que se repuso durante la reapertura.
  const cuadrePorDia = new Map()
  for (const c of cuadresDelPuesto) {
    const dia = aDia(c.fecha)
    if (!dia || dia < diaDesde || dia > diaHasta) continue
    const previo = cuadrePorDia.get(dia)
    if (!previo || ms(c.actualizadoEn) >= ms(previo.actualizadoEn)) cuadrePorDia.set(dia, c)
  }
  if (cuadrePorDiaForzado) {
    for (const [dia, c] of cuadrePorDiaForzado) cuadrePorDia.set(dia, c)
  }

  // netos: producto → día → Σ deltaQuiosco. Se acumula desde el primer día del
  // rango hacia adelante (ver netoDesdePorProducto): lo anterior no entra en
  // ningún stockAlInicio del rango.
  const netos = new Map()
  // grupos: producto → día → Map<clave, paso>
  const grupos = new Map()

  for (const m of movs) {
    if (m.anulado) continue
    const productoId = m.productoId
    if (!productoId) continue
    const dia = fechas.get(m.id) || aDia(m.creadoEn)
    if (!dia || dia < diaDesde) continue

    const delta = Math.trunc(Number(m.deltaQuiosco) || 0)

    let porDia = netos.get(productoId)
    if (!porDia) {
      porDia = new Map()
      netos.set(productoId, porDia)
    }
    porDia.set(dia, (porDia.get(dia) ?? 0) + delta)

    // 1) Lo que el cuadre está excluyendo: su propia venta y la anulación de
    //    una reapertura. No son un paso, son justamente lo que se compara.
    if (dia > diaHasta || delta === 0) continue
    const cuadre = cuadrePorDia.get(dia)
    if (cuadre?.estado === 'cerrado' && ms(m.creadoEn) > ms(cuadre.cerradoEn)) continue
    if (cuadre?.id && m.cuadreId === cuadre.id) continue

    const clave = claveGrupo(m)
    let porProducto = grupos.get(productoId)
    if (!porProducto) {
      porProducto = new Map()
      grupos.set(productoId, porProducto)
    }
    let delDia = porProducto.get(dia)
    if (!delDia) {
      delDia = new Map()
      porProducto.set(dia, delDia)
    }
    let paso = delDia.get(clave)
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
      delDia.set(clave, paso)
    }
    paso.delta += delta
    paso.cantidad += Math.trunc(Number(m.cantidad) || 0)
  }

  const saldosMap = saldos instanceof Map
    ? saldos
    : new Map((saldos ?? []).map(f => [f.productoId, f]))

  const stockDe = productoId => Number(saldosMap.get(productoId)?.quiosco) || 0

  // Un producto que no se movió desde el primer día del rango tampoco tiene por
  // qué estar en los movimientos: entra por su saldo, o se quedaría sin
  // capacidad justo cuando es el caso fácil (nada se movió, la capacidad es el
  // stock).
  const ids = new Set([...netos.keys(), ...grupos.keys()])
  for (const [productoId] of saldosMap) ids.add(productoId)

  for (const productoId of ids) {
    const netoDesde = netoDesdePorProducto(netos.get(productoId))
    const gruposDelProducto = grupos.get(productoId)
    const stock = stockDe(productoId)
    const celdas = new Map()

    for (const dia of dias) {
      // Clamp a 0: si algún saldo quedó descuadrado por datos viejos, mostrar un
      // negativo en la pantalla del jefe sería peor que mentir un poco.
      const inicial = Math.max(0, stock - netoDesde(dia))

      const pasos = [...(gruposDelProducto?.get(dia)?.values() ?? [])]
        .filter(p => p.delta !== 0)
        .sort((a, b) => a.creadoEn - b.creadoEn)

      const movimiento = pasos.reduce((s, p) => s + p.delta, 0)
      celdas.set(dia, {
        inicial,
        capacidad: inicial + movimiento,
        pasos,
        cuadreId: cuadrePorDia.get(dia)?.id ?? null
      })
    }

    salida.set(productoId, celdas)
  }

  return salida
}

/**
 * Suma de deltaQuiosco desde cada día del rango hacia adelante.
 *
 * Es `netoDesde` del cuadre, pero resuelto una sola vez por producto con sumas
 * de sufijo: recorrer el libro entero por cada día del mes saldría a mes ×
 * movimientos. El puntero `p` avanza porque `diasDelRango` y las claves van
 * ascendentes, así que en total se recorre cada lista una vez.
 */
function netoDesdePorProducto(porDia) {
  if (!porDia || porDia.size === 0) return () => 0
  const claves = [...porDia.keys()].sort()
  const acc = new Array(claves.length + 1).fill(0)
  for (let i = claves.length - 1; i >= 0; i--) acc[i] = acc[i + 1] + (porDia.get(claves[i]) ?? 0)
  let p = 0
  return (dia) => {
    while (p < claves.length && claves[p] < dia) p++
    return p < claves.length ? acc[p] : 0
  }
}

/**
 * Capacidad de venta por producto para UN cuadre.
 *
 * No tiene matemática propia: es capacidadDelMes() con un rango de un solo día
 * y el cuadre que le pasa el llamante. Así el "Q:N" de la pantalla del cuadre y
 * la celda de /historial-quiosco no pueden dar números distintos.
 *
 * @param {object} p — los mismos parámetros de capacidadDelMes, más:
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

  const diaCuadre = aDia(fechaCuadre)
  if (!diaCuadre) return new Map()

  const porProducto = capacidadDelMes({
    movimientos,
    cuadres,
    lotes,
    traspasos,
    saldos,
    desde: diaCuadre,
    hasta: diaCuadre,
    // El cuadre que trae el llamante manda sobre el que hubiera en el libro.
    cuadrePorDia: new Map([[diaCuadre, { id: cuadreId, estado: cerrado ? 'cerrado' : 'abierto', cerradoEn }]])
  })

  const salida = new Map()
  for (const [productoId, celdas] of porProducto) {
    const celda = celdas.get(diaCuadre)
    if (!celda) continue
    salida.set(productoId, {
      inicial: celda.inicial,
      capacidad: celda.capacidad,
      pasos: celda.pasos
    })
  }
  return salida
}
