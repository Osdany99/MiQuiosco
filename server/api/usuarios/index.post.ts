import { usuarioSchema, usuarioDbSchema } from '~~/shared/schemas/usuario'
import { crudCreate } from '../../utils/crud'
import { hashPin } from '../../utils/auth'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)

  return await crudCreate({ tabla: 'usuarios', schema: usuarioSchema, puestoScoped: true, dbSchema: usuarioDbSchema }, {
    body,
    auth,
    hooks: {
      beforeCreate: async (payload) => {
        const { pin, ...resto } = payload
        const out = { ...resto }
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
