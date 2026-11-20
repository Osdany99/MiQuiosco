import { z } from 'zod'

export const cuadreItemSchema = z.object({
  // El id lo genera el dispositivo y viaja en el POST: conservarlo hace que el
  // alta sea idempotente (un reintento actualiza, no duplica) y que el id en
  // memoria coincida con el guardado. Sin esto el servidor creaba otro id y el
  // autoguardado volvía a crear el cuadre entero en cada pasada.
  id: z.string().uuid('ID de línea inválido').optional(),
  cuadreId: z.string().uuid('ID de cuadre inválido'),
  productoId: z.string().uuid('ID de producto inválido'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo').default(0),
  cantidad: z.number().min(0, 'La cantidad no puede ser negativa').default(0),
  subtotal: z.number().min(0, 'El subtotal no puede ser negativo').default(0),
  tipoLinea: z.enum(['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar'], { message: 'Tipo de línea inválido' }).default('normal'),
  nota: z.string().nullable().optional(),
  esExtra: z.boolean().default(false),
  loteId: z.string().uuid('ID de lote inválido').nullable().optional(),
  secuencia: z.number().int().min(0).default(0)
})
