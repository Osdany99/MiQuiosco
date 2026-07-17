import { crudList } from '../../utils/crud'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  return await crudList({ tabla: 'historial_precios' }, { query })
})
