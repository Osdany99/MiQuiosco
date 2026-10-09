import { z } from 'zod'

export const createTransferenciaSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  monto: z.number().positive('El monto debe ser mayor que cero.')
})
