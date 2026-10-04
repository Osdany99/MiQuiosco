import { z } from 'zod'

const lineaDirecta = z.object({
  id: z.string().uuid('ID de línea inválido').optional(),
  productoId: z.string().uuid('ID de producto inválido'),
  cantidad: z.number().int().min(0, 'La cantidad no puede ser negativa'),
  precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo'),
  secuencia: z.number().int().min(0).optional().default(0)
})

/**
 * Venta directa: efectivo cobrado por el jefe fuera de un cuadre.
 *
 * No lleva cuadreId a propósito — la plata no entra a ninguna gaveta. El
 * producto sí sale del inventario (FIFO) desde la ubicación que elija el jefe.
 */
export const ventaDirectaSchema = z.object({
  ubicacion: z.enum(['almacen', 'quiosco'], { message: 'Ubicación inválida' }).default('almacen'),
  lineas: z
    .array(lineaDirecta)
    .min(1, 'Debe incluir al menos un producto.'),
  notas: z.string().nullable().optional()
})

/**
 * Deuda directa: el jefe fía por fuera del cuadre. Se diferencia de la deuda
 * normal en que no hay cuadre de origen, así que no pasa por el tope ni suma
 * a ningún cuadre, pero sí descuenta inventario y congela su costo FIFO.
 */
export const deudaDirectaSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  ubicacion: z.enum(['almacen', 'quiosco'], { message: 'Ubicación inválida' }).default('almacen'),
  lineas: z
    .array(lineaDirecta)
    .min(1, 'Debe incluir al menos un producto.'),
  montoPagadoInicial: z.number().min(0, 'El monto no puede ser negativo').optional().default(0),
  formaPagoInicial: z
    .enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' })
    .optional()
    .default('efectivo'),
  notas: z.string().nullable().optional()
})

/**
 * Pago de una deuda. cuadreId = null significa cobro directo: el jefe cobró
 * por fuera y el efectivo no entró a la gaveta de ningún cuadre.
 */
export const pagoFiadoDirectoSchema = z.object({
  cuentaFiadoId: z.string().uuid('ID de cuenta inválido'),
  cuadreId: z.string().uuid('ID de cuadre inválido').nullable().optional(),
  monto: z.number().min(0, 'El monto no puede ser negativo'),
  formaPago: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' })
})
