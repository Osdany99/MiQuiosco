/**
 * api-offline/productos/update.js
 *
 * Actualiza un producto. Si cambió el precio de compra o de venta,
 * cierra el registro vigente del historial y crea uno nuevo.
 * Espejo de server/api/productos/[id].put.ts + la lógica de historial.
 */
import { useDb } from '../../db-offline/client'

/**
 * @param {string} id
 * @param {object} cambios — { nombre?, descripcion?, precioCompraActual?, precioVentaActual?, orden?, activo? }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function update(id, cambios, auth) {
  const db = useDb()
  const actual = await db.getById('productos', id)
  if (!actual) throw new Error(`Producto ${id} no existe.`)

  const precioCambioCompra = cambios.precioCompraActual !== undefined
    && Number(cambios.precioCompraActual) !== Number(actual.precioCompraActual)
  const precioCambioVenta = cambios.precioVentaActual !== undefined
    && Number(cambios.precioVentaActual) !== Number(actual.precioVentaActual)
  const cambioPrecio = precioCambioCompra || precioCambioVenta

  const ahora = Date.now()
  const payload = { ...cambios, actualizadoEn: ahora, sincronizado: 0 }
  await db.update('productos', id, payload)

  if (cambioPrecio) {
    const historiales = await db.queryAll('historial_precios')
    const vigente = historiales.find(h => h.productoId === id && !h.vigenteHasta)

    let nuevoVigenteDesde = ahora
    if (vigente) {
      nuevoVigenteDesde = Math.max(ahora, vigente.vigenteDesde + 1)
      const vigenteHastaSeguro = Math.max(nuevoVigenteDesde - 1, vigente.vigenteDesde)
      await db.update('historial_precios', vigente.id, {
        vigenteHasta: vigenteHastaSeguro,
        actualizadoEn: ahora,
        sincronizado: 0
      })
    }

    await db.insert('historial_precios', {
      id: crypto.randomUUID(),
      productoId: id,
      precioCompra: cambios.precioCompraActual !== undefined
        ? Number(cambios.precioCompraActual)
        : Number(actual.precioCompraActual),
      precioVenta: cambios.precioVentaActual !== undefined
        ? Number(cambios.precioVentaActual)
        : Number(actual.precioVentaActual),
      vigenteDesde: nuevoVigenteDesde,
      vigenteHasta: null,
      cambiadoPor: auth?.usuarioActual?.value?.nombre ?? 'local',
      creadoEn: ahora,
      actualizadoEn: ahora,
      sincronizado: 0
    })
  }

  const p = await db.getById('productos', id)
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    activo: p.activo,
    orden: p.orden,
    precioCompraActual: Number(p.precioCompraActual),
    precioVentaActual: Number(p.precioVentaActual),
    puestoId: p.puestoId,
    creadoEn: p.creadoEn,
    actualizadoEn: p.actualizadoEn
  }
}
