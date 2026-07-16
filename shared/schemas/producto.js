import { z } from 'zod'

export const productoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  descripcion: z.string().nullable().optional(),
  precioCompraActual: z.number().min(0, 'El precio no puede ser negativo').default(0),
  precioVentaActual: z.number().min(0, 'El precio no puede ser negativo').default(0),
  orden: z.number().int().min(1, 'El orden debe ser al menos 1').default(0),
  activo: z.boolean().default(true)
})
