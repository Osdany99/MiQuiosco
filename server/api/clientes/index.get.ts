import { isNull } from 'drizzle-orm'
import { requirePermiso } from '../../utils/permisos'
import { crudList } from '../../utils/crud'
import { clientes } from '../../database/schema'

/**
 * Lista de clientes del puesto.
 *
 * Los clientes fusionados NO se devuelven: su identidad ya vive en el principal
 * y siguen existiendo solo para no romper el historial que los referencia. Con
 * `?incluirFusionados=1` se pueden ver (diagnóstico y auditoría).
 */
export default defineEventHandler(async (event) => {
  const auth = await requirePermiso(event, {
    jefe: null,
    trabajador: ['acciones.cuadre.fiar', 'acciones.cuadre.transferencia']
  })
  const query = getQuery(event)
  return await crudList(
    { tabla: 'clientes', puestoScoped: true },
    {
      query,
      auth,
      listFilter: ({ query: q }) => (q.incluirFusionados ? undefined : isNull(clientes.fusionadoEn))
    }
  )
})
