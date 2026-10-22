import { isNull } from 'drizzle-orm'
import { requireRole } from '../../utils/auth'
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
  const auth = await requireRole(event, 'jefe')
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
