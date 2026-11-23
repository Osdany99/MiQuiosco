/**
 * Separa operaciones que mueven stock para enviar cabecera + líneas + libro en
 * la MISMA petición. Un 409 debe revertir la operación entera, no solo el
 * movimiento que chocó con otra venta.
 */
export function separarOperacionesStock(pendientes = {}) {
  const restante = {}
  for (const [tabla, filas] of Object.entries(pendientes)) {
    restante[tabla] = Array.isArray(filas) ? [...filas] : filas
  }
  const grupos = []
  const filasDe = tabla => Array.isArray(pendientes?.[tabla]) ? pendientes[tabla] : []
  const movimientos = filasDe('movimientos_inventario')

  function agregar(anchor, idsPorTabla) {
    const payload = {}
    let total = 0
    for (const [tabla, ids] of Object.entries(idsPorTabla)) {
      const filas = filasDe(tabla).filter(fila => ids.has(fila.id))
      if (!filas.length) continue
      payload[tabla] = filas
      total += filas.length
    }
    if (!payload.movimientos_inventario?.length) return
    grupos.push({ anchor, payload, total })
    for (const [tabla, filas] of Object.entries(payload)) {
      const ids = new Set(filas.map(fila => fila.id))
      restante[tabla] = (restante[tabla] ?? []).filter(fila => !ids.has(fila.id))
    }
  }

  for (const id of new Set(movimientos.map(m => m.traspasoId).filter(Boolean))) {
    agregar('traspasos', {
      traspasos: new Set([id]),
      movimientos_inventario: new Set(movimientos.filter(m => m.traspasoId === id).map(m => m.id))
    })
  }

  for (const id of new Set(movimientos.map(m => m.cuadreId).filter(Boolean))) {
    const items = filasDe('cuadre_items').filter(item => item.cuadreId === id)
    const itemIds = new Set(items.map(item => item.id))
    agregar('cuadre_items', {
      cuadres: new Set([id]),
      cuadre_items: new Set(itemIds),
      movimientos_inventario: new Set(movimientos.filter(mov => (
        mov.cuadreId === id || (mov.lineaCuadreId && itemIds.has(mov.lineaCuadreId))
      )).map(mov => mov.id))
    })
  }

  const itemsFiado = filasDe('cuentas_fiado_items')
  const itemFiadoPorId = new Map(itemsFiado.map(item => [item.id, item]))
  const cuentasIds = new Set(movimientos.map(mov => (
    itemFiadoPorId.get(mov.cuentaFiadoItemId)?.cuentaFiadoId
  )).filter(Boolean))
  for (const id of cuentasIds) {
    const items = itemsFiado.filter(item => item.cuentaFiadoId === id)
    const itemIds = new Set(items.map(item => item.id))
    agregar('cuentas_fiado', {
      cuentas_fiado: new Set([id]),
      cuentas_fiado_items: new Set(itemIds),
      movimientos_inventario: new Set(movimientos.filter(mov => (
        mov.cuentaFiadoItemId && itemIds.has(mov.cuentaFiadoItemId)
      )).map(mov => mov.id))
    })
  }

  const itemsVenta = filasDe('ventas_directas_items')
  for (const id of new Set(movimientos.map(m => m.ventaDirectaId).filter(Boolean))) {
    const items = itemsVenta.filter(item => item.ventaDirectaId === id)
    const itemIds = new Set(items.map(item => item.id))
    agregar('ventas_directas', {
      ventas_directas: new Set([id]),
      ventas_directas_items: new Set(itemIds),
      movimientos_inventario: new Set(movimientos.filter(mov => (
        mov.ventaDirectaId === id || (mov.ventaDirectaItemId && itemIds.has(mov.ventaDirectaItemId))
      )).map(mov => mov.id))
    })
  }

  return { grupos, restante }
}
