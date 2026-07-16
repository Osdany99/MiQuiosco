import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const auth = await requireRole(event, 'jefe')
  return await crudList({ tabla: 'usuarios', puestoScoped: true }, {
    auth,
    serialize: (row) => {
      const copy = { ...row }
      delete copy.pinHash
      return copy
    }
  })
})
