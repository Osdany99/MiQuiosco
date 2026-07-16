import { z } from 'zod'

export const historialPrecioSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  precioCompra: z.number().min(0, 'El precio no puede ser negativo'),
  precioVenta: z.number().min(0, 'El precio no puede ser negativo'),
  vigenteDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato de fecha inválido'),
  vigenteHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato de fecha inválido').nullable().optional(),
  cambiadoPor: z.string().uuid('ID de usuario inválido').nullable().optional()
})
