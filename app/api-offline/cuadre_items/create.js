/**
 * api-offline/cuadre_items/create.js
 */
import { useDb } from '../../db-offline/client'

export async function create(datos, _auth) {
  void _auth
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = useDb()
  const registro = {
    id,
    cuadreId: datos.cuadreId,
    productoId: datos.productoId,
    precioVentaUsado: datos.precioVentaUsado ?? 0,
    cantidad: datos.cantidad ?? 0,
    subtotal: datos.subtotal ?? 0,
    tipoLinea: datos.tipoLinea ?? 'normal',
    nota: datos.nota ?? null,
    esExtra: datos.esExtra ?? false,
    creadoEn: ahora,
    actualizadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('cuadre_items', registro)
  return registro
}
