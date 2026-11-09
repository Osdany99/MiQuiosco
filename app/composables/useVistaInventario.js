/**
 * useVistaInventario — Estado de una vista de inventario por ubicación.
 *
 * Compartido por /quiosco y /almacen: solo cambia qué columna se muestra y qué
 * acciones aplican. Evita duplicar la carga de saldos, lotes y proveedores.
 *
 * El estado de cada fila (OK / Reponer / Bajo mínimo / No se vende) NO se
 * calcula aquí: lo trae shared/inventario/analitica.js, que es el mismo que
 * usan las gráficas. Si divergieran, la tabla y la gráfica dirían cosas
 * distintas del mismo producto.
 */
import { estadoDeFila } from '../../shared/inventario/analitica'
import { saldosDeLote } from '../../shared/inventario/operaciones'

const COLOR_POR_ESTADO = {
  'ok': 'success',
  'reponer': 'warning',
  'bajo-minimo': 'error',
  'no-se-vende': 'neutral'
}

export function useVistaInventario(ubicacion) {
  const inv = useInventario()

  const esQuiosco = computed(() => ubicacion === 'quiosco')

  const cargando = ref(true)
  const saldos = ref([])
  const lotesHistorial = ref([])
  const productosActivos = ref([])

  const showAjuste = ref(false)
  const showLotes = ref(false)
  const productoAjuste = ref(null)
  const productoLotes = ref(null)

  // Corrección de una entrada del historial de compras (cantidad y/o precio).
  const showCorreccion = ref(false)
  const loteCorreccion = ref(null)

  // Venta fuera de cuadre: efectivo o fiado del producto de la fila tocada.
  // El estado vive aquí porque /quiosco y /almacen comparten este composable.
  const showVenta = ref(false)
  const modoVenta = ref('venta')
  const productoVenta = ref(null)

  // Detalle de un lote del historial de compras.
  const showDetalleLote = ref(false)
  const loteDetalle = ref(null)

  // Filtros y columnas del historial de compras.
  const busquedaHistorial = ref('')
  const filtroHistorial = ref('con-stock')
  const incluirAnulados = ref(false)

  const columns = computed(() => [
    { accessorKey: 'nombre', header: 'Producto' },
    { accessorKey: esQuiosco.value ? 'quiosco' : 'almacen', header: 'Stock' },
    { accessorKey: esQuiosco.value ? 'stockMinimoQuiosco' : 'stockMinimoAlmacen', header: 'Mín' },
    ...(esQuiosco.value ? [{ accessorKey: 'stockRecomendadoQuiosco', header: 'Recomendado' }] : []),
    { accessorKey: 'costoActual', header: 'Costo' },
    { accessorKey: esQuiosco.value ? 'valorizadoQuiosco' : 'valorizadoAlmacen', header: 'Valorizado' },
    { accessorKey: 'estado', header: 'Estado' },
    { accessorKey: 'acciones', header: '' }
  ])

  /**
   * Selector de columnas. Producto y Stock son las que se ven de entrada;
   * 'acciones' es estructural (header vacío) y por eso nunca entra al selector
   * ni se puede apagar. Misma regla que usa BaseTable (esColumnaEstructural).
   */
  const COLUMNAS_POR_DEFECTO = ['Producto', 'Stock']

  const visibleHeaders = ref(COLUMNAS_POR_DEFECTO)

  const columnHeaders = computed(() =>
    columns.value.filter(c => c.header).map(c => c.header)
  )

  const visibleColumns = computed(() =>
    columns.value.filter(c => !c.header || visibleHeaders.value.includes(c.header))
  )

  const columnsHistorial = [
    { accessorKey: 'fechaEntrada', header: 'Fecha' },
    { accessorKey: 'nombreProducto', header: 'Producto' },
    { accessorKey: 'cantidadInicial', header: 'Cant.' },
    { accessorKey: 'precioUnitario', header: 'P. compra' },
    { accessorKey: 'valor', header: 'Valor' },
    { accessorKey: 'saldo', header: 'Saldo' },
    { accessorKey: 'salidas', header: 'Salidas' },
    { accessorKey: 'valorRestante', header: 'Valor rest.' },
    { accessorKey: 'origen', header: 'Origen' },
    { accessorKey: 'detalleCompra', header: 'Detalle' },
    // Estructural: ver el detalle y corregir la entrada. No entra al selector
    // de columnas ni se puede apagar (misma regla que 'acciones' en `columns`).
    { accessorKey: 'acciones', header: '' }
    // 'origen' muestra el proveedor (o el lugar de compra). El dato se sigue
    // calculando en cada fila; solo se oculta la columna. Ver app/utils/flags.js
  ].filter(c => MOSTRAR_PROVEEDOR || c.accessorKey !== 'origen')
    .map(c => ({
      ...c,
      visible: c.header === '' || ['Fecha', 'Producto', 'Cant.', 'P. compra', 'Saldo', 'Salidas'].includes(c.header)
    }))

  /**
   * Columnas visibles del historial. Se arranca con lo esencial (como en la
   * pestaña de stock) y el resto queda disponible en el selector.
   */
  const COLUMNAS_HISTORIAL_POR_DEFECTO = [
    'Fecha', 'Producto', 'Cant.', 'P. compra', 'Saldo', 'Salidas'
  ]

  const visibleHeadersHistorial = ref([...COLUMNAS_HISTORIAL_POR_DEFECTO])

  const columnHeadersHistorial = computed(() =>
    columnsHistorial.filter(c => c.header).map(c => c.header)
  )

  const visibleColumnsHistorial = computed(() =>
    columnsHistorial.filter(c => !c.header || visibleHeadersHistorial.value.includes(c.header))
  )

  /** Normaliza para buscar sin distinguir mayúsculas ni acentos. */
  function normalizarTexto(v) {
    return String(v ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim()
  }

  /**
   * Historial filtrado: búsqueda por producto/descripción y estado del stock.
   * Los anulados quedan fuera salvo que se pidan expresamente.
   */
  const lotesHistorialFiltrados = computed(() => {
    const q = normalizarTexto(busquedaHistorial.value)
    return lotesHistorial.value.filter((l) => {
      if (!incluirAnulados.value && l.anulado) return false
      if (filtroHistorial.value === 'con-stock' && !l.conStock) return false
      if (filtroHistorial.value === 'sin-stock' && l.conStock) return false
      if (!q) return true
      return normalizarTexto(`${l.nombreProducto ?? ''} ${l.descripcionProducto ?? ''}`).includes(q)
    })
  })

  /**
   * En /quiosco sale lo mismo que en el cuadre: un producto con 'Vende' apagado
   * no se lista, tenga stock o no. /almacen sí lo muestra completo, porque allí
   * sigue siendo mercancía del puesto y hay que poder devolverlo o ajustarlo.
   */
  const filas = computed(() =>
    esQuiosco.value ? saldos.value.filter(f => f.seVende !== false) : saldos.value
  )

  // Del estado de cada fila decide la regla compartida de estadoDeFila (la
  // misma que usan /graficas). Su rama 'no-se-vende' ya no aparece en la tabla
  // de /quiosco porque esas filas se filtran arriba, pero sigue viva en las
  // gráficas.
  function estado(fila) {
    return estadoDeFila(fila, esQuiosco.value ? 'quiosco' : 'almacen')
  }

  function colorEstado(fila) {
    return COLOR_POR_ESTADO[estado(fila).estado]
  }

  function textoEstado(fila) {
    return estado(fila).texto
  }

  function abrirAjuste(productoId) {
    productoAjuste.value = productoId
    showAjuste.value = true
  }

  function abrirLotes(fila) {
    productoLotes.value = { id: fila.productoId, nombre: fila.nombre, descripcion: fila.descripcion ?? null }
    showLotes.value = true
  }

  /** Corregir la cantidad o el precio con que una entrada llegó al almacén. */
  function abrirCorreccion(fila) {
    loteCorreccion.value = fila
    showCorreccion.value = true
  }

  /** Ver el desglose completo de un lote (resumen + ventas por tipo). */
  function abrirDetalleLote(fila) {
    loteDetalle.value = fila
    showDetalleLote.value = true
  }

  /** Venta directa (efectivo) o deuda directa (fiado) del producto de la fila. */
  function abrirVenta(fila, modo = 'venta') {
    productoVenta.value = fila
    modoVenta.value = modo
    showVenta.value = true
  }

  const sinMovimientos = computed(() => !cargando.value && lotesHistorial.value.length === 0)

  /** Sin productos no hay entrada posible: la vista vacía debe apuntar a /productos. */
  const hayProductos = computed(() => !cargando.value && productosActivos.value.length > 0)

  async function recargar() {
    cargando.value = true
    try {
      saldos.value = await inv.cargarSaldos() ?? []
      const [lotesRows, prods, provs] = await Promise.all([
        inv.cargarLotes().catch(() => []),
        inv.cargarProductos().catch(() => []),
        inv.cargarProveedores().catch(() => [])
      ])
      const filas = await conSaldosDeLote(lotesRows ?? [])
      const nombreProd = new Map((prods ?? []).map(p => [p.id, p.nombre]))
      const descripcionProd = new Map((prods ?? []).map(p => [p.id, p.descripcion ?? null]))
      const nombreProv = new Map((provs ?? []).map(p => [p.id, p.nombre]))
      lotesHistorial.value = filas
        .slice()
        .sort((a, b) => String(b.fechaEntrada ?? '').localeCompare(String(a.fechaEntrada ?? '')))
        .map((l) => {
          const stock = (Number(l.saldoAlmacen) || 0) + (Number(l.saldoQuiosco) || 0)
          return {
            ...l,
            nombreProducto: nombreProd.get(l.productoId) ?? '—',
            descripcionProducto: descripcionProd.get(l.productoId) ?? null,
            origen: l.proveedorId ? (nombreProv.get(l.proveedorId) ?? '—') : (l.lugarCompra || '—'),
            conStock: stock > 0,
            salidas: Math.max(0, (Number(l.cantidadInicial) || 0) - stock),
            valorRestante: Math.round(stock * (Number(l.precioUnitario) || 0) * 100) / 100
          }
        })
      productosActivos.value = prods ?? []
    } finally {
      cargando.value = false
    }
  }

  /**
   * El endpoint /api/lotes ya viene con los saldos del libro, pero el sqlite
   * devuelve la fila cruda. Sin este paso el diálogo de corrección abriría con
   * piso 0 en modo offline y dejaría bajar la cantidad por debajo de lo que ya
   * salió. Se usa el MISMO cálculo del servidor (saldosDeLote).
   */
  async function conSaldosDeLote(lotes) {
    if (!lotes.some(l => l.saldoAlmacen == null || l.saldoQuiosco == null)) return lotes
    const crudos = await inv.movimientosRepo.value.readAll()
    const movs = Array.isArray(crudos) ? crudos : (crudos?.data ?? [])
    return lotes.map((l) => {
      if (l.saldoAlmacen != null && l.saldoQuiosco != null) return l
      const s = saldosDeLote(l, movs)
      return {
        ...l,
        saldoAlmacen: s.almacen,
        saldoQuiosco: s.quiosco,
        conConsumo: s.consumido,
        salidasAlmacen: s.salidasAlmacen,
        piso: s.piso
      }
    })
  }

  onMounted(recargar)

  return {
    inv,
    esQuiosco,
    cargando,
    saldos,
    filas,
    lotesHistorial,
    lotesHistorialFiltrados,
    columns,
    columnsHistorial,
    visibleHeaders,
    columnHeaders,
    visibleColumns,
    visibleHeadersHistorial,
    columnHeadersHistorial,
    visibleColumnsHistorial,
    busquedaHistorial,
    filtroHistorial,
    incluirAnulados,
    colorEstado,
    textoEstado,
    abrirAjuste,
    abrirLotes,
    abrirCorreccion,
    abrirDetalleLote,
    abrirVenta,
    recargar,
    sinMovimientos,
    hayProductos,
    showAjuste,
    showLotes,
    productoAjuste,
    productoLotes,
    showCorreccion,
    loteCorreccion,
    showDetalleLote,
    loteDetalle,
    showVenta,
    modoVenta,
    productoVenta
  }
}
