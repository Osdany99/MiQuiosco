import { eq } from 'drizzle-orm'
import { db } from '../../database/client'
import { recargas } from '../../database/schema'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'
import { updateRecargaSchema } from '#shared/schemas/recarga'

/**
 * Lo único editable a mano: asignar el cliente cuando el auto-registro no lo
 * reconoció, y marcar pago/cobro. Los montos del SMS son inmutables.
 */
export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = String(event.context.params?.id ?? '')
  const body = await readBody(event)
  const parsed = updateRecargaSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }
  if (!Object.keys(parsed.data).length) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  // 404 si no existe O si es de otro puesto (misma respuesta). Tambien evita
  // reasignar el cliente de una recarga ajena.
  await exigirPuesto(auth, 'recargas', id, 'Recarga')

  const [r] = await db
    .update(recargas)
    .set({ ...parsed.data, actualizadoEn: new Date() })
    .where(eq(recargas.id, id))
    .returning()
  if (!r) {
    throw createError({ statusCode: 404, statusMessage: 'Recarga no encontrada.' })
  }
  return {
    id: r.id,
    clienteId: r.clienteId,
    estadoPago: r.estadoPago,
    montoCobrado: r.montoCobrado,
    actualizadoEn: r.actualizadoEn.toISOString()
  }
})
