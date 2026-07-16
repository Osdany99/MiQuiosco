import { usuarioSchema, usuarioDbSchema } from '~~/shared/schemas/usuario'
import { crudPatch } from '../../utils/crud'
import { hashPin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const id = event.context.params!.id as string
  const body = await readBody(event)

  return await crudPatch({ tabla: 'usuarios', label: 'Usuario', schema: usuarioSchema, dbSchema: usuarioDbSchema }, {
    id,
    body,
    auth,
    hooks: {
      beforeUpdate: async (cambios) => {
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
