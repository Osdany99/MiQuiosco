import { z } from 'zod'

export const createCuentaFiadoSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  cuadreOrigenId: z.string().uuid('ID de cuadre inválido'),
  // Vacío cuando la deuda se registra solo por monto, sin productos.
  items: z
    .array(
      z.object({
        productoId: z.string().uuid('ID de producto inválido'),
        cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
        precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo')
      })
    )
    .optional()
    .default([]),
  // Monto directo para la deuda sin productos. Cuando items tiene filas, el
  // servidor recalcula el total a partir de ellas e ignora este campo.
  montoTotal: z.number().min(0, 'El monto no puede ser negativo').optional().default(0),
  montoPagadoInicial: z.number().min(0, 'El monto no puede ser negativo').optional().default(0),
  formaPagoInicial: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' }).optional().default('efectivo')
}).refine(d => (d.items ?? []).length > 0 || Number(d.montoTotal ?? 0) > 0,
  { message: 'Agrega al menos un producto o un monto mayor a cero.' }
)
