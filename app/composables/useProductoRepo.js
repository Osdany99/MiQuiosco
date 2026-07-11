/** Hacerlo un triger */

export function useProductoRepo() {
  const repo = useLocalRepo('productos')
  const historialRepo = useLocalRepo('historial_precios')
  const auth = useAuth()

  function vigenteDesdeSeguro(vigenteAnterior) {
    const ahora = Date.now()
    if (!vigenteAnterior) return ahora
    return Math.max(ahora, vigenteAnterior.vigenteDesde + 1)
  }

  async function create(datos) {
    const producto = await repo.create({
      ...datos,
      puestoId: datos.puestoId ?? auth.usuarioActual.value?.puestoId
    })
    await historialRepo.create({
      productoId: producto.id,
      precioCompra: datos.precioCompraActual ?? 0,
      precioVenta: datos.precioVentaActual ?? 0,
      vigenteDesde: vigenteDesdeSeguro(null),
      vigenteHasta: null,
      cambiadoPor: auth.usuarioActual.value?.nombre ?? 'local'
    })
    return producto
  }

  async function update(id, cambios) {
    const actual = await repo.read(id)
    if (!actual) return

    const precioCambioCompra = cambios.precioCompraActual !== undefined
      && Number(cambios.precioCompraActual) !== Number(actual.precioCompraActual)
    const precioCambioVenta = cambios.precioVentaActual !== undefined
      && Number(cambios.precioVentaActual) !== Number(actual.precioVentaActual)

    await repo.update(id, cambios)

    if (precioCambioCompra || precioCambioVenta) {
      const historiales = await historialRepo.readAll()
      const vigente = historiales.find(
        h => h.productoId === id && !h.vigenteHasta
      )

      const nuevoVigenteDesde = vigenteDesdeSeguro(vigente)

      if (vigente) {
        const vigenteHastaSeguro = Math.max(nuevoVigenteDesde - 1, vigente.vigenteDesde)
        await historialRepo.update(vigente.id, { vigenteHasta: vigenteHastaSeguro })
      }

      await historialRepo.create({
        productoId: id,
        precioCompra: cambios.precioCompraActual ?? Number(actual.precioCompraActual),
        precioVenta: cambios.precioVentaActual ?? Number(actual.precioVentaActual),
        vigenteDesde: nuevoVigenteDesde,
        vigenteHasta: null,
        cambiadoPor: auth.usuarioActual.value?.nombre ?? 'local'
      })
    }
  }

  async function getHistorial(productoId) {
    const historiales = await historialRepo.readAll({ orderBy: 'vigenteDesde', orderDir: 'desc' })
    return historiales.filter(h => h.productoId === productoId)
  }

  return { ...repo, create, update, patch: update, getHistorial }
}
