import { z } from 'zod'

export const itemTransferenciaEditSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo')
})

export const updateTransferenciaSchema = z.object({
  items: z
    .array(itemTransferenciaEditSchema)
    .min(1, 'Debe incluir al menos un producto.')
})
