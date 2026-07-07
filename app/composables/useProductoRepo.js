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
      productoId: producto.id,
      precioCompra: datos.precioCompra ?? 0,
      precioVenta: datos.precioVenta ?? 0,
      vigenteDesde: Date.now(),
      vigenteHasta: null,
      cambiadoPor: auth.usuarioActual.value?.nombre ?? 'local'
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

    const precioCambioCompra = cambios.precioCompra !== undefined
      && Number(cambios.precioCompra) !== Number(actual.precioCompra)
    const precioCambioVenta = cambios.precioVenta !== undefined
      && Number(cambios.precioVenta) !== Number(actual.precioVenta)

    await repo.update(id, cambios)

    if (precioCambioCompra || precioCambioVenta) {
      // Cerrar historial vigente
      const historiales = await historialRepo.readAll()
      const vigente = historiales.find(
        h => h.productoId === id && !h.vigenteHasta
      )
      if (vigente) {
        await historialRepo.update(vigente.id, { vigenteHasta: Date.now() })
      }

      // Abrir nuevo historial
      await historialRepo.create({
        productoId: id,
        precioCompra: cambios.precioCompra ?? Number(actual.precioCompra),
        precioVenta: cambios.precioVenta ?? Number(actual.precioVenta),
        vigenteDesde: Date.now(),
        vigenteHasta: null,
        cambiadoPor: auth.usuarioActual.value?.nombre ?? 'local'
      })
    }
  }

  /**
   * Retorna el historial de precios de un producto, ordenado descendente.
   */
  async function getHistorial(productoId) {
    const historiales = await historialRepo.readAll({ orderBy: 'vigenteDesde', orderDir: 'desc' })
    return historiales.filter(h => h.productoId === productoId)
  }

  return { create, update, ...repo, getHistorial }
}
