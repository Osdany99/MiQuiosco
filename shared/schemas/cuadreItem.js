import { z } from 'zod'

export const cuadreItemSchema = z.object({
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  productoId: z.string().uuid('ID de producto inválido'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo').default(0),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa').default(0),
  subtotal: z.number().min(0, 'El subtotal no puede ser negativo').default(0),
  tipoLinea: z.enum(['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar'], { message: 'Tipo de línea inválido' }).default('normal'),
  nota: z.string().nullable().optional(),
  esExtra: z.boolean().default(false)
})
