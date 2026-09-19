import { z } from 'zod'

export const createTransferenciaSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  items: z
    .array(
      z.object({
        productoId: z.string().uuid('ID de producto inválido'),
        cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
        precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo')
      })
    )
    .min(1, 'Debe incluir al menos un producto.')
})
