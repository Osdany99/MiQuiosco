import { crudRemove } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  await requireRole(event, 'jefe')
  return await crudRemove({ tabla: 'usuarios', label: 'Usuario', id: event.context.params!.id as string })
})
