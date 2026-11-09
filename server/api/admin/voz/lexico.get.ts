import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozLexico } from '../../../database/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const rows = await db.select().from(vozLexico).orderBy(asc(vozLexico.version))
  return rows
})
