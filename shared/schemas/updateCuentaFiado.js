import { z } from 'zod'

export const itemFiadoEditSchema = z.object({
  productoId: z.string().uuid('ID de producto invalido'),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo')
})

export const updateCuentaFiadoSchema = z.object({
  items: z
    .array(itemFiadoEditSchema)
    .min(1, 'Debe incluir al menos un producto.')
})
