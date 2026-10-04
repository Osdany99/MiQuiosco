import { eq, sql } from 'drizzle-orm'
import { db } from '../../database/client'
import { ajustes, cuadres } from '../../database/schema'
import { requireRole } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const id = event.context.params?.id
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })

  const [ajuste] = await db
    .select()
    .from(ajustes)
    .where(eq(ajustes.id, id))
    .limit(1)

  if (!ajuste) {
    throw createError({ statusCode: 404, statusMessage: 'Ajuste no encontrado.' })
  }

  // OJO: .set() espera claves JS ('montoRegalo'), no nombres SQL. La version
  // anterior usaba [campo.name] ('monto_regalo') y drizzle lo ignoraba EN
  // SILENCIO: el ajuste se borraba pero el acumulado del cuadre no se revertia.
  await db.transaction(async (tx) => {
    if (ajuste.tipo === 'regalo') {
      await tx
        .update(cuadres)
        .set({ montoRegalo: sql`GREATEST(${cuadres.montoRegalo} - ${ajuste.monto}, 0)` })
        .where(eq(cuadres.id, ajuste.cuadreId))
    } else {
      await tx
        .update(cuadres)
        .set({ montoDescuento: sql`GREATEST(${cuadres.montoDescuento} - ${ajuste.monto}, 0)` })
        .where(eq(cuadres.id, ajuste.cuadreId))
    }

    await tx.delete(ajustes).where(eq(ajustes.id, id))
  })

  return { id }
})
