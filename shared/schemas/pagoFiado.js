import { z } from 'zod'

export const pagoFiadoSchema = z.object({
  cuentaFiadoId: z.string().uuid('ID de cuenta inválido'),
  // null = cobro directo: el jefe cobró por fuera y el efectivo no entró a la
  // gaveta de ningún cuadre.
  cuadreId: z.string().uuid('ID de cuadre inválido').nullable(),
  monto: z.number().min(0, 'El monto no puede ser negativo'),
  formaPago: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' })
})
