import { z } from 'zod'

export const createCuentaFiadoSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  cuadreOrigenId: z.string().uuid('ID de cuadre inválido'),
  items: z
    .array(
      z.object({
        productoId: z.string().uuid('ID de producto inválido'),
        cantidad: z.number().min(0, 'La cantidad no puede ser negativa'),
        precioVentaUsado: z.number().min(0, 'El precio no puede ser negativo')
      })
    )
    .min(1, 'Debe incluir al menos un producto.'),
  montoPagadoInicial: z.number().min(0, 'El monto no puede ser negativo').optional().default(0),
  formaPagoInicial: z.enum(['efectivo', 'transferencia'], { message: 'Forma de pago inválida' }).optional().default('efectivo')
})
