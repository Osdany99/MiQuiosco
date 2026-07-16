import { eq, and } from 'drizzle-orm'
import { cuadreSchema } from '~~/shared/schemas/cuadre'
import { crudCreate } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { db, schema } from '../../database/client'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)

  return await crudCreate({ tabla: 'cuadres', schema: cuadreSchema, puestoScoped: true }, {
    body,
    auth,
    hooks: {
      beforeCreate: async (payload, authUser) => {
        const pId = payload.puestoId || authUser?.usuario?.puestoId
        const fecha = payload.fecha
        if (pId && fecha) {
          const existente = await db
            .select({ id: schema.cuadres.id })
            .from(schema.cuadres)
            .where(and(eq(schema.cuadres.puestoId, pId), eq(schema.cuadres.fecha, fecha)))
            .limit(1)
          if (existente.length > 0) {
            throw createError({ statusCode: 409, statusMessage: 'Ya existe un cuadre para este puesto en la fecha de hoy.' })
          }
        }
        return {
          ...payload,
          jefeId: payload.jefeId || authUser?.usuario?.id || null,
          puestoId: pId
        }
      }
    }
  })
})
