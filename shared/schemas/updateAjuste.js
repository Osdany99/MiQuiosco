import { z } from 'zod'

export const updateAjusteSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido').nullable().optional(),
  productoId: z.string().uuid('ID de producto inválido').optional(),
  tipo: z.enum(['regalo', 'descuento'], { message: 'Tipo de ajuste inválido' }).optional(),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa').optional(),
  monto: z.number().min(0, 'El monto no puede ser negativo').optional(),
  nota: z.string().max(255, 'La nota no puede superar 255 caracteres').nullable().optional()
})
