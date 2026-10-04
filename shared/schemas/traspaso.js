import { z } from 'zod'

// Traspaso almacén → quiosco. Una o varias líneas en el mismo traspaso.
export const traspasoSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  notas: z.string().nullable().optional(),
  lineas: z
    .array(
      z.object({
        productoId: z.string().uuid('ID de producto inválido'),
        cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1')
      })
    )
    .min(1, 'Agrega al menos un producto')
})

// Merma o devolución manual (jefe).
export const ajusteInventarioSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  tipo: z.enum(['merma', 'devolucion'], { message: 'Tipo inválido' }),
  ubicacion: z.enum(['quiosco', 'almacen'], { message: 'Ubicación inválida' }),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  motivo: z.string().min(1, 'El motivo es obligatorio').max(200),
  nota: z.string().nullable().optional()
})
