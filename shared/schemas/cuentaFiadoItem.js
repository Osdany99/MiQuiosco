import { z } from 'zod'

export const cuentaFiadoItemSchema = z.object({
  cuentaFiadoId: z.string().uuid('ID de cuenta inválido'),
  productoId: z.string().uuid('ID de producto inválido'),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo'),
  subtotal: z.number().min(0, 'El subtotal no puede ser negativo')
})
