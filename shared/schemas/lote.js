import { z } from 'zod'

export const TIPOS_MOVIMIENTO = [
  'entrada',
  'traspaso',
  'venta',
  'merma',
  'devolucion',
  'anulacion'
]

export const loteSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  proveedorId: z.string().uuid().nullable().optional(),
  lugarCompra: z.string().max(150).nullable().optional(),
  fechaEntrada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  cantidadInicial: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  precioUnitario: z.number().min(0, 'El precio no puede ser negativo'),
  detalleCompra: z.string().max(200).nullable().optional(),
  entradaRef: z.string().uuid().nullable().optional(),
  notas: z.string().nullable().optional()
})

export const movimientoInventarioSchema = z.object({
  productoId: z.string().uuid('ID de producto inválido'),
  loteId: z.string().uuid().nullable().optional(),
  cuadreId: z.string().uuid().nullable().optional(),
  lineaCuadreId: z.string().uuid().nullable().optional(),
  traspasoId: z.string().uuid().nullable().optional(),
  tipo: z.enum(TIPOS_MOVIMIENTO, { message: 'Tipo de movimiento inválido' }),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  deltaAlmacen: z.number().int(),
  deltaQuiosco: z.number().int(),
  precioUnitario: z.number().min(0),
  importe: z.number().min(0),
  motivo: z.string().max(200).nullable().optional(),
  nota: z.string().nullable().optional()
})
