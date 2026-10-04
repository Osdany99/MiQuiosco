import { z } from 'zod'

export const ventaDirectaItemSchema = z.object({
  ventaDirectaId: z.string().uuid('ID de venta inválido'),
  productoId: z.string().uuid('ID de producto inválido'),
  cantidad: z.number().int().min(0, 'La cantidad no puede ser negativa'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo'),
  subtotal: z.number().min(0, 'El subtotal no puede ser negativo'),
  costoUnitario: z.number().min(0, 'El costo no puede ser negativo'),
  costoTotal: z.number().min(0, 'El costo no puede ser negativo'),
  secuencia: z.number().int().min(0).default(0)
})
