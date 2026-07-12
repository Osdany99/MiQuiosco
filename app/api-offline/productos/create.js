/**
 * api-offline/productos/create.js
 *
 * Crea un producto local con puestoId inyectado y crea su primera entrada
 * en historial de precios. Espejo de server/api/productos/index.post.ts
 * + la lógica de historial que antes vivía en useProductoRepo.js.
 */
import { useDb } from '../../db-offline/client'
import { inyectarPuestoId } from '../../utils-offline/inyectarPuestoId'

/**
 * @param {object} datos — { nombre, descripcion?, precioCompraActual, precioVentaActual, orden, activo? }
 * @param {object} auth
 * @returns {Promise<object>}
 */
export async function create(datos, auth) {
  const payload = inyectarPuestoId(datos, auth)
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = useDb()

  const registro = {
    id,
    puestoId: payload.puestoId,
    nombre: payload.nombre,
    descripcion: payload.descripcion ?? null,
    activo: payload.activo ?? true,
    orden: payload.orden ?? 0,
    precioCompraActual: payload.precioCompraActual ?? 0,
    precioVentaActual: payload.precioVentaActual ?? 0,
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('productos', registro)

  // Crear entrada inicial en historial de precios
  const vigenteDesde = ahora
  const historialId = crypto.randomUUID()
  await db.insert('historial_precios', {
    id: historialId,
    productoId: id,
    precioCompra: Number(payload.precioCompraActual ?? 0),
    precioVenta: Number(payload.precioVentaActual ?? 0),
    vigenteDesde,
    vigenteHasta: null,
    cambiadoPor: auth?.usuarioActual?.value?.nombre ?? 'local',
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  })

  return {
    id: registro.id,
    nombre: registro.nombre,
    descripcion: registro.descripcion,
    activo: registro.activo,
    orden: registro.orden,
    precioCompraActual: Number(registro.precioCompraActual),
    precioVentaActual: Number(registro.precioVentaActual),
    puestoId: registro.puestoId,
    creadoEn: registro.creadoEn,
    actualizadoEn: registro.actualizadoEn
  }
}
