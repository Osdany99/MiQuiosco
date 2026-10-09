import { z } from 'zod'

export const updateTransferenciaSchema = z.object({
  monto: z.number().positive('El monto debe ser mayor que cero.')
})
