import { cuadreItemSchema } from '#shared/schemas/cuadreItem'
import { crudCreate } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'cuadre_items', schema: cuadreItemSchema }, {
    body,
    auth,
    hooks: {
      // La linea hereda el puesto del cuadre: no se injectan lineas ajenas.
      beforeCreate: async (data, authUser) => {
        await exigirPuesto(authUser!, 'cuadres', data.cuadreId, 'Cuadre')
        return data
      }
    }
  })
})
