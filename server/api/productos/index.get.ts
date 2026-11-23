import { crudList } from '../../utils/crud'
import { filtrarCostosTrabajador, requirePermiso } from '../../utils/permisos'

export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: null,
    trabajador: 'acciones.cuadre.fiar'
  })
  const query = getQuery(event)
  const orderOpts = {
    orderBy: query.orderBy || 'orden',
    orderDir: query.orderDir || 'asc'
  }
  const filas = await crudList({ tabla: 'productos', puestoScoped: true }, { query: { ...query, ...orderOpts }, auth })
  return filtrarCostosTrabajador(auth, filas)
})
