/**
 * api-offline/cuentas_fiado_items/create.js
 */
import { useDb } from '../../db-offline/client'

export async function create(datos, _auth) {
  void _auth
  const ahora = Date.now()
  const id = crypto.randomUUID()
  const db = useDb()
  const registro = {
    id,
    cuentaFiadoId: datos.cuentaFiadoId,
    productoId: datos.productoId,
    cantidad: datos.cantidad,
    precioVentaUsado: datos.precioVentaUsado,
    subtotal: datos.subtotal,
    creadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('cuentas_fiado_items', registro)
  return registro
}
