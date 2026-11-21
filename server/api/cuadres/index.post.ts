import { eq, and } from 'drizzle-orm'
import { cuadreSchema } from '#shared/schemas/cuadre'
import { diaEnOffset, diasEntreDias } from '#shared/fechas'
import { crudCreate } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { db, schema } from '../../database/client'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)

  return await crudCreate({ tabla: 'cuadres', schema: cuadreSchema, puestoScoped: true, idempotente: true }, {
    body,
    auth,
    hooks: {
      beforeCreate: async (payload, authUser) => {
        const pId = payload.puestoId || authUser?.usuario?.puestoId
        // El cuadre es del día de negocio, no del día que diga el reloj del
        // aparato: en Cuba un teléfono adelantado pedía a las 23:30 el cuadre
        // de mañana y chocaba con el índice único (puesto, fecha).
        const hoy = diaEnOffset(Date.now())
        let fecha = payload.fecha
        if (fecha && hoy) {
          const delta = diasEntreDias(fecha, hoy)
          if (Number.isFinite(delta) && delta > 1) {
            throw createError({
              statusCode: 400,
              statusMessage: 'La fecha del cuadre está en el futuro: revisa la hora del equipo.'
            })
          }
          if (Number.isFinite(delta) && delta === 1) {
            // Un día por delante = el equipo cruzó de día antes que el servidor.
            fecha = hoy
          }
        }
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
          fecha,
          jefeId: payload.jefeId || authUser?.usuario?.id || null,
          puestoId: pId
        }
      }
    }
  })
})
