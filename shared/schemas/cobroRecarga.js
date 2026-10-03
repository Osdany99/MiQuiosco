import { z } from 'zod'

/** Cobro contra una recarga fiada (append-only, como pagos_fiado). */
export const createCobroRecargaSchema = z.object({
  recargaId: z.string().uuid('ID de recarga inválido'),
  monto: z.number().positive('El monto debe ser positivo'),
  formaPago: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' }).default('efectivo')
})
