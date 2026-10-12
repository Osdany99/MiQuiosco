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

/**
 * Corrección de una entrada ya registrada.
 *
 * Los dos campos son opcionales a propósito: se puede corregir solo el precio,
 * solo la cantidad, o los dos. `null` significa "no lo toques", que es
 * distinto de `0` (un precio de 0 sí es un valor válido que se guarda).
 *
 * El motivo es obligatorio en las dos: sin él no queda rastro de por qué se
 * reescribió una compra ya anotada.
 *
 * Las reglas de fondo (hasta dónde puede bajar la cantidad, qué movimientos
 * se tocan) NO están aquí: viven en shared/inventario/operaciones.js, que es
 * donde ya se comparten servidor y sqlite.
 */
export const correccionLoteSchema = z
  .object({
    cantidadInicial: z
      .number()
      .int('La cantidad debe ser un número entero')
      .min(1, 'La cantidad debe ser al menos 1')
      .nullish(),
    precioUnitario: z.number().min(0, 'El precio no puede ser negativo').nullish(),
    motivo: z.string().min(1, 'El motivo es obligatorio').max(200)
  })
  .refine(d => d.cantidadInicial != null || d.precioUnitario != null, {
    message: 'Escribe la cantidad o el precio correctos.'
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
