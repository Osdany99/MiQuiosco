import { z } from 'zod'
import { SYNC_TABLES } from '../tables.js'

const pushSyncShape = {}
for (const t of SYNC_TABLES) {
  pushSyncShape[t.tabla] = z.array(z.record(z.string(), z.any())).default([])
}
pushSyncShape.deletes = z.array(z.object({
  tabla: z.string().min(1),
  id: z.string().min(1)
})).default([])

export const pushSyncSchema = z.object(pushSyncShape)
