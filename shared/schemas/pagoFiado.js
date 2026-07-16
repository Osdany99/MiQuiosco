import { z } from 'zod'

export const pagoFiadoSchema = z.object({
  cuentaFiadoId: z.string().uuid('ID de cuenta inválido'),
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  monto: z.number().min(0, 'El monto no puede ser negativo'),
  formaPago: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' })
})
