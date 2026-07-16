import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudList({ tabla: 'clientes', puestoScoped: true })
})
