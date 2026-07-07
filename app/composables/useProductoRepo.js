/**
 * useProductoRepo — Repositorio local de productos con tracking de historial de precios.
 *
 * Extiende useLocalRepo('productos') pero interpone la escritura de
 * historial_precios cada vez que el precio cambia.
 */
export function useProductoRepo() {
  const repo = useLocalRepo('productos')
  const historialRepo = useLocalRepo('historial_precios')
  const auth = useAuth()

  /**
   * Crea un producto y su primer registro de historial.
   */
  async function create(datos) {
    const producto = await repo.create(datos)
    await historialRepo.create({
      producto_id: producto.id,
      precio_compra: datos.precio_compra ?? 0,
      precio_venta: datos.precio_venta ?? 0,
      vigente_desde: Date.now(),
      vigente_hasta: null,
      cambiado_por: auth.usuarioActual.value?.nombre ?? 'local'
    })
    return producto
  }

  /**
   * Actualiza un producto. Si el precio cambió, cierra el historial
   * anterior y abre uno nuevo.
   */
  async function update(id, cambios) {
    const actual = await repo.read(id)
    if (!actual) return

    const precioCambioCompra = cambios.precio_compra !== undefined
      && Number(cambios.precio_compra) !== Number(actual.precio_compra)
    const precioCambioVenta = cambios.precio_venta !== undefined
      && Number(cambios.precio_venta) !== Number(actual.precio_venta)

    await repo.update(id, cambios)

    if (precioCambioCompra || precioCambioVenta) {
      // Cerrar historial vigente
      const historiales = await historialRepo.readAll()
      const vigente = historiales.find(
        h => h.producto_id === id && !h.vigente_hasta
      )
      if (vigente) {
        await historialRepo.update(vigente.id, { vigente_hasta: Date.now() })
      }

      // Abrir nuevo historial
      await historialRepo.create({
        producto_id: id,
        precio_compra: cambios.precio_compra ?? Number(actual.precio_compra),
        precio_venta: cambios.precio_venta ?? Number(actual.precio_venta),
        vigente_desde: Date.now(),
        vigente_hasta: null,
        cambiado_por: auth.usuarioActual.value?.nombre ?? 'local'
      })
    }
  }

  /**
   * Retorna el historial de precios de un producto, ordenado descendente.
   */
  async function getHistorial(productoId) {
    const historiales = await historialRepo.readAll({ orderBy: 'vigente_desde', orderDir: 'desc' })
    return historiales.filter(h => h.producto_id === productoId)
  }

  return { create, update, ...repo, getHistorial }
}
