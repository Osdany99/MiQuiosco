import { z } from 'zod'

export const createAjusteSchema = z.object({
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  clienteId: z.string().uuid('ID de cliente inválido').nullable().optional().default(null),
  productoId: z.string().uuid('ID de producto inválido'),
  tipo: z.enum(['regalo', 'descuento'], { message: 'Tipo de ajuste inválido' }),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
  monto: z.number().min(0, 'El monto no puede ser negativo'),
  nota: z.string().max(255, 'La nota no puede superar 255 caracteres').nullable().optional().default(null)
})
