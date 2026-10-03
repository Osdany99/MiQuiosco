import { cuentaFiadoItemSchema } from '#shared/schemas/cuentaFiadoItem'
import { crudCreate } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'cuentas_fiado_items', schema: cuentaFiadoItemSchema }, {
    body,
    auth,
    hooks: {
      // La linea hereda el puesto de la cuenta (ver cuadre-items/index.post.ts).
      beforeCreate: async (data, authUser) => {
        await exigirPuesto(authUser!, 'cuentas_fiado', data.cuentaFiadoId, 'Cuenta de fiado')
        return data
      }
    }
  })
})
