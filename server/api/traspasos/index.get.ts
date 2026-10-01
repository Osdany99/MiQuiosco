import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  const query = getQuery(event)
  return await crudList({ tabla: 'traspasos', puestoScoped: true }, { query })
})
