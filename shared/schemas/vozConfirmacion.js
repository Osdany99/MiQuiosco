// shared/schemas/vozConfirmacion.js — payload de auditoría central del Modo PRO.
import { z } from 'zod'

export const vozConfirmacionSchema = z.object({
  productoId: z.string().uuid().optional().nullable(),
  productoNombre: z.string().max(120).optional().nullable(),
  cantidad: z.number().int().positive().optional().nullable(),
  ubicacion: z.enum(['quiosco', 'almacen']).optional().nullable(),
  modo: z.string().max(32).optional().nullable(),
  confianza: z.number().min(0).max(1).optional().nullable(),
  outcome: z.enum(['auto-confirmado', 'cancelado', 'abandonado'])
})
