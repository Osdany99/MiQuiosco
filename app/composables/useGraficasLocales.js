/**
 * useGraficasLocales — Cálculo local de todas las gráficas del negocio.
 *
 * Reemplaza las llamadas a /api/graficas/* leyendo desde useLocalRepo.
 */
export function useGraficasLocales() {
  const productoRepo = useLocalRepo('productos')
  const cuadreRepo = useLocalRepo('cuadres')
  const itemsRepo = useLocalRepo('cuadre_items')
  const historialRepo = useLocalRepo('historial_precios')

  /**
   * Retorna los datos para la gráfica solicitada.
   * @param {string} key — identificador de la gráfica
   * @param {Object} opts — { desde, hasta, agrupacion, productoId }
   * @returns {Promise<Array>}
   */
  async function calcular(key, opts) {
    switch (key) {
      case 'productos-mas-vendidos': return productosMasVendidos(opts)
      case 'productos-mayor-ganancia': return productosMayorGanancia(opts)
      case 'productos-menor-rotacion': return productosMenorRotacion(opts)
      case 'ganancia-por-periodo': return gananciaPorPeriodo(opts)
      case 'ingresos-por-periodo': return ingresosPorPeriodo(opts)
      case 'regalos-descuentos-por-periodo': return regalosDescuentosPeriodo(opts)
      case 'faltantes-sobrantes-acumulados': return faltantesSobrantes(opts)
      case 'evolucion-producto': return evolucionProducto(opts)
      case 'precio-usado-vs-oficial': return precioUsadoVsOficial(opts)
      case 'proporcion-formas-pago': return proporcionFormasPago(opts)
      case 'estado-cuadres': return estadoCuadres(opts)
      case 'cuadres-reabiertos': return cuadresReabiertos(opts)
      case 'pagos-trabajadores': return pagosTrabajadores(opts)
      case 'comparativa-por-trabajador': return comparativaTrabajador(opts)
      default: return []
    }
  }

  /** Carga items + cuadres dentro del rango de fechas, con productos. */
  async function cargarDatos(opts) {
    const [todosCuadres, todosItems, todosProductos] = await Promise.all([
      cuadreRepo.readAll(),
      itemsRepo.readAll(),
      productoRepo.readAll()
    ])

    const prodMap = {}
    for (const p of todosProductos) prodMap[p.id] = p

    const desdeMs = opts.desde ? new Date(opts.desde).getTime() : 0
    const hastaMs = opts.hasta ? new Date(opts.hasta).getTime() + 86400000 : Infinity

    const cuadresFiltrados = todosCuadres.filter(c => {
      const cMs = new Date(c.fecha).getTime()
      return cMs >= desdeMs && cMs < hastaMs
    })
    const cuadreIds = new Set(cuadresFiltrados.map(c => c.id))
    const itemsFiltrados = todosItems.filter(i => cuadreIds.has(i.cuadre_id))

    return { cuadres: cuadresFiltrados, items: itemsFiltrados, prodMap, todosCuadres }
  }

  /** Agrupa un array de objetos por período. */
  function agrupar(arr, key, agrupacion) {
    if (agrupacion === 'dia') return arr
    const grupos = {}
    for (const item of arr) {
      const d = new Date(item[key])
      const clave = agrupacion === 'semana'
        ? `${d.getFullYear()}-W${getWeek(d)}`
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!grupos[clave]) grupos[clave] = []
      grupos[clave].push(item)
    }
    return Object.entries(grupos).map(([periodo, items]) => ({ periodo, items }))
  }

  function getWeek(d) {
    const start = new Date(d.getFullYear(), 0, 1)
    return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
  }

  async function productosMasVendidos() {
    const { items, prodMap } = await cargarDatos({})
    const ventas = {}
    for (const i of items) {
      ventas[i.producto_id] = (ventas[i.producto_id] || 0) + (Number(i.cantidad) || 0)
    }
    return Object.entries(ventas)
      .map(([id, totalVendido]) => ({
        nombre: prodMap[id]?.nombre || '—',
        totalVendido
      }))
      .sort((a, b) => b.totalVendido - a.totalVendido)
      .slice(0, 10)
  }

  async function productosMayorGanancia() {
    const { items, prodMap } = await cargarDatos({})
    const ganancias = {}
    for (const i of items) {
      const p = prodMap[i.producto_id]
      const ganancia = (Number(i.precio_venta_usado) - Number(p?.precio_compra_actual || 0)) * (Number(i.cantidad) || 0)
      ganancias[i.producto_id] = (ganancias[i.producto_id] || 0) + ganancia
    }
    return Object.entries(ganancias)
      .map(([id, gananciaTotal]) => ({
        nombre: prodMap[id]?.nombre || '—',
        gananciaTotal: Math.round(gananciaTotal)
      }))
      .sort((a, b) => b.gananciaTotal - a.gananciaTotal)
      .slice(0, 10)
  }

  async function productosMenorRotacion() {
    const { items, prodMap } = await cargarDatos({})
    const ventas = {}
    for (const i of items) {
      ventas[i.producto_id] = (ventas[i.producto_id] || 0) + (Number(i.cantidad) || 0)
    }
    return Object.entries(ventas)
      .filter(([id]) => prodMap[id]?.activo !== false)
      .map(([id, totalVendido]) => ({
        nombre: prodMap[id]?.nombre || '—',
        totalVendido
      }))
      .sort((a, b) => a.totalVendido - b.totalVendido)
      .slice(0, 10)
  }

  async function gananciaPorPeriodo(opts) {
    const { items, prodMap } = await cargarDatos(opts)
    const periodos = agrupar(
      items.map(i => {
        const p = prodMap[i.producto_id]
        const ganancia = (Number(i.precio_venta_usado) - Number(p?.precio_compra_actual || 0)) * (Number(i.cantidad) || 0)
        return { periodo: i.creado_en ? new Date(i.creado_en).toISOString().split('T')[0] : '', ganancia }
      }),
      'periodo',
      opts.agrupacion || 'dia'
    )
    return periodos.map(g => ({
      periodo: g.periodo ?? g,
      ganancia: Math.round(g.items ? g.items.reduce((s, x) => s + x.ganancia, 0) : g.ganancia)
    }))
  }

  async function ingresosPorPeriodo(opts) {
    const { items } = await cargarDatos(opts)
    const periodos = agrupar(
      items.map(i => ({
        periodo: i.creado_en ? new Date(i.creado_en).toISOString().split('T')[0] : '',
        ingresoTotal: Number(i.subtotal) || 0
      })),
      'periodo',
      opts.agrupacion || 'dia'
    )
    return periodos.map(g => ({
      periodo: g.periodo ?? g,
      ingresoTotal: g.items ? g.items.reduce((s, x) => s + x.ingresoTotal, 0) : g.ingresoTotal
    }))
  }

  async function regalosDescuentosPeriodo(opts) {
    const { items } = await cargarDatos(opts)
    const filtrados = items.filter(i => i.tipo_linea && i.tipo_linea !== 'normal')
    const periodos = agrupar(
      filtrados.map(i => {
        const valor = Number(i.subtotal) || 0
        return {
          periodo: i.creado_en ? new Date(i.creado_en).toISOString().split('T')[0] : '',
          esRegalo: i.tipo_linea === 'regalo',
          valor
        }
      }),
      'periodo',
      opts.agrupacion || 'dia'
    )
    return periodos.map(g => ({
      periodo: g.periodo ?? g,
      valorRegalado: g.items ? g.items.filter(x => x.esRegalo).reduce((s, x) => s + x.valor, 0) : 0,
      valorDescontado: g.items ? g.items.filter(x => !x.esRegalo).reduce((s, x) => s + x.valor, 0) : 0
    }))
  }

  async function faltantesSobrantes(opts) {
    const { cuadres } = await cargarDatos(opts)
    const periodos = agrupar(
      cuadres.filter(c => c.diferencia != null).map(c => ({
        periodo: c.fecha,
        diferencia: Number(c.diferencia) || 0
      })),
      'periodo',
      opts.agrupacion || 'dia'
    )
    return periodos.map(g => ({
      periodo: g.periodo ?? g,
      diferencia: g.items ? g.items.reduce((s, x) => s + x.diferencia, 0) : g.diferencia
    }))
  }

  async function evolucionProducto(opts) {
    if (!opts.productoId) return []
    const { items } = await cargarDatos(opts)
    const diario = {}
    for (const i of items) {
      if (i.producto_id !== opts.productoId) continue
      const fecha = i.creado_en ? new Date(i.creado_en).toISOString().split('T')[0] : ''
      diario[fecha] = (diario[fecha] || 0) + (Number(i.cantidad) || 0)
    }
    return Object.entries(diario)
      .map(([fecha, cantidadVendida]) => ({ fecha, cantidadVendida }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  async function precioUsadoVsOficial(opts) {
    if (!opts.productoId) return []
    const { items, prodMap } = await cargarDatos(opts)
    const prod = prodMap[opts.productoId]
    if (!prod) return []
    return items
      .filter(i => i.producto_id === opts.productoId)
      .map(i => ({
        fecha: i.creado_en ? new Date(i.creado_en).toISOString().split('T')[0] : '',
        precioVentaUsado: Number(i.precio_venta_usado) || 0,
        precioOficialActual: Number(prod.precio_venta_actual) || 0
      }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  }

  async function proporcionFormasPago(opts) {
    const { cuadres } = await cargarDatos(opts)
    let efectivo = 0; let transferencia = 0; let fiado = 0
    for (const c of cuadres) {
      efectivo += Number(c.total_real_caja) || 0
      transferencia += Number(c.monto_transferencia) || 0
      fiado += Number(c.monto_fiado) || 0
    }
    return [
      { forma: 'Efectivo', total: efectivo },
      { forma: 'Transferencia', total: transferencia },
      { forma: 'Fiado', total: fiado }
    ]
  }

  async function estadoCuadres() {
    const { todosCuadres } = await cargarDatos({})
    const estados = { abierto: 0, cerrado: 0 }
    let reabiertos = 0
    for (const c of todosCuadres) {
      if (c.reabierto_veces > 0) reabiertos++
      else if (c.estado === 'cerrado') estados.cerrado++
      else estados.abierto++
    }
    return [
      { estado: 'Abiertos', cantidad: estados.abierto },
      { estado: 'Cerrados', cantidad: estados.cerrado },
      { estado: 'Reabiertos', cantidad: reabiertos }
    ]
  }

  async function cuadresReabiertos() {
    const { todosCuadres } = await cargarDatos({})
    return todosCuadres
      .filter(c => c.reabierto_veces > 0)
      .map(c => ({
        fecha: c.fecha,
        reabiertoVeces: c.reabierto_veces,
        ultimaReapertura: c.ultima_reapertura_en
          ? new Date(c.ultima_reapertura_en).toLocaleString('es-ES')
          : '—'
      }))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  }

  async function pagosTrabajadores(opts) {
    const { cuadres } = await cargarDatos(opts)
    const pagos = {}
    for (const c of cuadres) {
      const id = c.trabajador_turno_id || 'sin-asignar'
      pagos[id] = (pagos[id] || 0) + (Number(c.pago_trabajador) || 0)
    }
    return Object.entries(pagos).map(([trabajadorNombre, totalPagado]) => ({
      trabajadorNombre,
      totalPagado
    }))
  }

  async function comparativaTrabajador(opts) {
    const { cuadres } = await cargarDatos(opts)
    const stats = {}
    for (const c of cuadres) {
      const id = c.trabajador_turno_id || 'sin-asignar'
      if (!stats[id]) stats[id] = { totalCuadres: 0, sumDiferencia: 0, cuadresConFaltante: 0 }
      stats[id].totalCuadres++
      if (c.diferencia != null) {
        const diff = Number(c.diferencia)
        stats[id].sumDiferencia += diff
        if (diff < 0) stats[id].cuadresConFaltante++
      }
    }
    return Object.entries(stats).map(([trabajadorNombre, s]) => ({
      trabajadorNombre,
      totalCuadres: s.totalCuadres,
      diferenciaPromedio: s.totalCuadres > 0 ? Math.round(s.sumDiferencia / s.totalCuadres) : 0,
      cuadresConFaltante: s.cuadresConFaltante
    }))
  }

  return { calcular }
}
