import { eq, and, ne } from 'drizzle-orm'
import { usuarioSchema, usuarioUpdateSchema, usuarioDbSchema } from '#shared/schemas/usuario'
import { crudPatch } from '../../utils/crud'
import { hashPin } from '../../utils/auth'
import { db } from '../../database/client'
import { usuarios } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)

  return await crudPatch({
    tabla: 'usuarios',
    label: 'Usuario',
    // usuarioUpdateSchema y no usuarioSchema.partial(): el partial() heredaba
    // los .default() de rol/activo, asi que un PATCH { notas } guardaba tambien
    // rol='trabajador' y degradaba al jefe sin que nadie lo pidiera.
    schema: usuarioSchema,
    updateSchema: usuarioUpdateSchema,
    dbSchema: usuarioDbSchema
  }, {
    id,
    body,
    auth,
    hooks: {
      beforeUpdate: async (cambios, authUser) => {
        // Guard: no permitir que el último jefe se quite el rol o se desactive a sí mismo
        const esAutocambio = authUser?.usuario?.id === id
        const intentaQuitarJefe = cambios.rol != null && cambios.rol !== 'jefe'
        const intentaDesactivar = cambios.activo === false
        if (esAutocambio && (intentaQuitarJefe || intentaDesactivar)) {
          const [target] = await db.select({ rol: usuarios.rol }).from(usuarios).where(eq(usuarios.id, id)).limit(1)
          if (target?.rol === 'jefe') {
            const otrosJefes = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.rol, 'jefe'), eq(usuarios.activo, true), ne(usuarios.id, id))).limit(1)
            if (otrosJefes.length === 0) {
              throw createError({ statusCode: 400, statusMessage: 'No puedes quitarte el rol de jefe o desactivarte si eres el último jefe activo.' })
            }
          }
        }
        if (!cambios.pin) return cambios
        const { pin, ...resto } = cambios
        return { ...resto, pinHash: await hashPin(pin) }
      }
    },
    serialize: (row) => {
      const copy = { ...row }
      delete copy.pinHash
      return copy
    }
  })
})
