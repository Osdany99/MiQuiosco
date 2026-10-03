import { crudList } from '../../utils/crud'
import { requireRole } from '../../utils/auth'
import { condicionHijosDelPuesto } from '../../utils/puesto'
import { historialPrecios } from '../../database/schema'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  const query = getQuery(event)
  return await crudList({ tabla: 'historial_precios' }, {
    query,
    auth,
    // El historial no lleva puestoId: solo el de productos propios.
    listFilter: ({ columns }) => condicionHijosDelPuesto(
      auth, 'historial_precios', columns.productoId
    )
  })
})
