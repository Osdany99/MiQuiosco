import { eq } from 'drizzle-orm'
import { usuarioSchema, usuarioDbSchema } from '#shared/schemas/usuario'
import { crudCreate } from '../../utils/crud'
import { hashPin } from '../../utils/auth'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)

  return await crudCreate({ tabla: 'usuarios', schema: usuarioSchema, puestoScoped: true, dbSchema: usuarioDbSchema }, {
    body,
    auth,
    hooks: {
      beforeCreate: async (payload) => {
        // El nombre es único GLOBAL: el login busca solo por nombre, así que
        // dos usuarios con el mismo nombre en puestos distintos colisionarían.
        const nombre = String(payload.nombre ?? '').trim()
        if (nombre) {
          const [duplicado] = await db
            .select({ id: usuarios.id })
            .from(usuarios)
            .where(eq(usuarios.nombre, nombre))
            .limit(1)
          if (duplicado) {
            throw createError({
              statusCode: 409,
              statusMessage: `Ya existe un usuario con el nombre «${nombre}».`
            })
          }
        }
        const { pin, ...resto } = payload
        const out = { ...resto }
        if (nombre) out.nombre = nombre
        if (pin) out.pinHash = await hashPin(pin)
        return out
      }
    },
    serialize: (row) => {
      const copy = { ...row }
      delete copy.pinHash
      return copy
    }
  })
})
