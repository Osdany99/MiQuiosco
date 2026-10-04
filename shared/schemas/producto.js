import { z } from 'zod'

export const productoSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  descripcion: z.string().nullable().optional(),
  precioCompraActual: z.number().min(0, 'El precio no puede ser negativo').default(0),
  precioVentaActual: z.number().min(0, 'El precio no puede ser negativo').default(0),
  orden: z.number().int().min(0, 'El orden no puede ser negativo').default(0),
  activoQuiosco: z.boolean().default(true),
  stockMinimoQuiosco: z.number().int().min(0, 'No puede ser negativo').default(0),
  stockRecomendadoQuiosco: z.number().int().min(0, 'No puede ser negativo').default(0),
  stockMinimoAlmacen: z.number().int().min(0, 'No puede ser negativo').default(0),
  unidad: z.string().max(30).nullable().optional(),
  activo: z.boolean().default(true)
})
