import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { lotes } from '../../database/schema'
import { crudRemove } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string

  // Primero el puesto (404 si es ajeno), antes de revelar si tiene compras.
  await exigirPuesto(auth, 'proveedores', id, 'Proveedor')

  const usos = await db.select({ id: lotes.id }).from(lotes).where(eq(lotes.proveedorId, id)).limit(1)
  if (usos.length > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'No se puede eliminar: el proveedor tiene compras registradas. Desactívalo en su lugar.'
    })
  }
  return await crudRemove({ tabla: 'proveedores', label: 'Proveedor', id, auth })
})
