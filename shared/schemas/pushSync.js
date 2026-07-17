import { z } from 'zod'

const SYNC_TABLES = [
  { tabla: 'productos' },
  { tabla: 'usuarios' },
  { tabla: 'cuadres' },
  { tabla: 'cuadre_items' },
  { tabla: 'cuentas_fiado' },
  { tabla: 'cuentas_fiado_items' },
  { tabla: 'pagos_fiado' },
  { tabla: 'historial_precios' }
]

const pushSyncShape = {}
for (const t of SYNC_TABLES) {
  pushSyncShape[t.tabla] = z.array(z.record(z.string(), z.any())).default([])
}
export const pushSyncSchema = z.object(pushSyncShape)
