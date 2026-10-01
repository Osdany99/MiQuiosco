import { z } from 'zod'

// Entrada al almacén: una compra con uno o varios productos.
// Cada línea genera un lote + un movimiento de tipo 'entrada'.
export const entradaAlmacenSchema = z.object({
  fechaEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  proveedorId: z.string().uuid().nullable().optional(),
  lugarCompra: z.string().max(150).nullable().optional(),
  detalleCompra: z.string().max(200).nullable().optional(),
  notas: z.string().nullable().optional(),
  lineas: z
    .array(
      z.object({
        productoId: z.string().uuid('ID de producto inválido'),
        cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
        precioUnitario: z.number().min(0, 'El precio no puede ser negativo')
      })
    )
    .min(1, 'Agrega al menos un producto')
})
