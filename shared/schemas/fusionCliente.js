import { z } from 'zod'

/**
 * Fusionar dos o más clientes en una sola identidad.
 *
 * El nombre final se decide aparte a propósito: puede ser el de cualquiera de
 * los implicados o uno nuevo. Los números conservan su nombre propio en
 * `clientes_telefonos.etiqueta`, así que después de fusionar se sigue sabiendo
 * cuál recarga fue a cada número.
 */
export const fusionClienteSchema = z.object({
  ids: z.array(z.string().uuid('ID de cliente inválido'))
    .min(2, 'Elige al menos dos clientes')
    .max(20, 'Demasiados clientes a la vez')
    .refine(ids => new Set(ids).size === ids.length, 'No repitas el mismo cliente'),
  nombreFinal: z.string().trim()
    .min(1, 'El nombre es requerido')
    .max(100, 'Máximo 100 caracteres')
})
