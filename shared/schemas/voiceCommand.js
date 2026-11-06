import { z } from 'zod'

export const voiceCommandIntent = z.enum(['venta_directa'], {
  message: 'Intent no soportado'
})

export const voiceCommandLine = z.object({
  productoHint: z.string().default(''),
  cantidad: z.number().int().min(1).default(1),
  precioUnitario: z.number().min(0).nullable().optional(),
  ubicacion: z.enum(['almacen', 'quiosco']).default('quiosco'),
  tipoVenta: z.enum(['directa', 'casa', 'familiar', 'regalo']).default('directa'),
  clienteHint: z.string().optional()
})

export const voiceCommandSchema = z.object({
  draftId: z.string().uuid(),
  intent: voiceCommandIntent,
  transcript: z.string(),
  lines: z.array(voiceCommandLine).min(1),
  confidence: z.number().min(0).max(1).optional(),
  estado: z.enum(['idle', 'listening', 'parsing', 'ready', 'error']).optional()
})
