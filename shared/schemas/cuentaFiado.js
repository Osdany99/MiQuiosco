import { z } from 'zod'

export const cuentaFiadoSchema = z.object({
  puestoId: z.string().uuid('ID de puesto inválido'),
  clienteId: z.string().uuid('ID de cliente inválido'),
  cuadreOrigenId: z.string().uuid('ID de cuadre inválido'),
  montoTotal: z.number().min(0, 'El monto no puede ser negativo').default(0),
  montoPagado: z.number().min(0, 'El monto no puede ser negativo').default(0),
  estado: z.enum(['pendiente', 'parcial', 'pagada'], { message: 'Estado inválido' }).default('pendiente')
})
