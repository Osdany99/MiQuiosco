/**
 * api-offline/pagos_fiado/create.js
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
    cuadreId: datos.cuadreId,
    monto: datos.monto,
    formaPago: datos.formaPago,
    creadoEn: ahora,
    sincronizado: 0
  }
  await db.insert('pagos_fiado', registro)
  return registro
}
