import { ventaDirectaItemSchema } from '#shared/schemas/ventaDirectaItem'
import { crudCreate } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { exigirPuesto } from '../../utils/puesto'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const body = await readBody(event)
  return await crudCreate({ tabla: 'ventas_directas_items', schema: ventaDirectaItemSchema }, {
    body,
    auth,
    hooks: {
      // La linea hereda el puesto de la venta (ver cuadre-items/index.post.ts).
      beforeCreate: async (data, authUser) => {
        await exigirPuesto(authUser!, 'ventas_directas', data.ventaDirectaId, 'Venta directa')
        return data
      }
    }
  })
})
