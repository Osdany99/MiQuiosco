import { crudRemove } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'clientes', label: 'Cliente', id: event.context.params!.id as string })
})
