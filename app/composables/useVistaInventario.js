/**
 * useVistaInventario — Estado de una vista de inventario por ubicación.
 *
 * Compartido por /quiosco y /almacen: solo cambia qué columna se muestra y qué
 * acciones aplican. Evita duplicar la carga de saldos, lotes y proveedores.
 */
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

  const columnsHistorial = [
    { accessorKey: 'fechaEntrada', header: 'Fecha' },
    { accessorKey: 'nombreProducto', header: 'Producto' },
    { accessorKey: 'cantidadInicial', header: 'Cant.' },
    { accessorKey: 'precioUnitario', header: 'P. compra' },
    { accessorKey: 'valor', header: 'Valor' },
    { accessorKey: 'origen', header: 'Origen' },
    { accessorKey: 'detalleCompra', header: 'Detalle' }
  ]

  const filas = computed(() => saldos.value)

  function stockDe(fila) {
    return esQuiosco.value ? fila.quiosco : fila.almacen
  }

  function minimoDe(fila) {
    return esQuiosco.value ? fila.stockMinimoQuiosco : fila.stockMinimoAlmacen
  }

  // Un producto desactivado solo del quiosco conserva stock: se muestra, pero
  // marcado "No se vende" para que el jefe lo devuelva o lo ajuste en vez de
  // perderlo de vista.
  function colorEstado(fila) {
    if (esQuiosco.value && fila.seVende === false) return 'neutral'
    const s = stockDe(fila)
    if (s < minimoDe(fila)) return 'error'
    if (esQuiosco.value && s < fila.stockRecomendadoQuiosco) return 'warning'
    return 'success'
  }

  function textoEstado(fila) {
    if (esQuiosco.value && fila.seVende === false) return 'No se vende'
    const s = stockDe(fila)
    if (s < minimoDe(fila)) return 'Bajo mínimo'
    if (esQuiosco.value && s < fila.stockRecomendadoQuiosco) return 'Reponer'
    return 'OK'
  }

  function abrirAjuste(productoId) {
    productoAjuste.value = productoId
    showAjuste.value = true
  }

  function abrirLotes(fila) {
    productoLotes.value = { id: fila.productoId, nombre: fila.nombre }
    showLotes.value = true
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
      const nombreProd = new Map((prods ?? []).map(p => [p.id, p.nombre]))
      const nombreProv = new Map((provs ?? []).map(p => [p.id, p.nombre]))
      lotesHistorial.value = (lotesRows ?? [])
        .slice()
        .sort((a, b) => String(b.fechaEntrada ?? '').localeCompare(String(a.fechaEntrada ?? '')))
        .map(l => ({
          ...l,
          nombreProducto: nombreProd.get(l.productoId) ?? '—',
          origen: l.proveedorId ? (nombreProv.get(l.proveedorId) ?? '—') : (l.lugarCompra || '—')
        }))
      productosActivos.value = prods ?? []
    } finally {
      cargando.value = false
    }
  }

  onMounted(recargar)

  return {
    inv,
    esQuiosco,
    cargando,
    saldos,
    filas,
    lotesHistorial,
    columns,
    columnsHistorial,
    colorEstado,
    textoEstado,
    abrirAjuste,
    abrirLotes,
    recargar,
    sinMovimientos,
    hayProductos,
    showAjuste,
    showLotes,
    productoAjuste,
    productoLotes
  }
}
