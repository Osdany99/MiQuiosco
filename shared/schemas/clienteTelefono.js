import { z } from 'zod'

/**
 * Teléfonos de clientes (1:N). El tope de 360 CUP es por número, así que un
 * cliente puede tener varios. `telefono` es la forma canónica de 10 dígitos:
 * si el número llega con 8 (Banco Metropolitano omite el prefijo 53) hay que
 * prefijarlo antes de guardar, o el mismo cliente quedaría partido en dos.
 */
export const clienteTelefonoSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido'),
  telefono: z.string().regex(/^\d{10}$/, 'Teléfono canónico de 10 dígitos'),
  telefonoRaw: z.string().max(20).nullable().optional(),
  etiqueta: z.string().max(40).nullable().optional(),
  activo: z.boolean().default(true)
})

export const updateClienteTelefonoSchema = z.object({
  /**
   * Reasignar a otro cliente es parte de la edición porque `telefono` es UNIQUE
   * en toda la tabla: si el número ya tuvo dueño, no se puede crear una fila
   * nueva, hay que mover (o reactivar) la existente.
   */
  clienteId: z.string().uuid('ID de cliente inválido').optional(),
  telefonoRaw: z.string().max(20).nullable().optional(),
  etiqueta: z.string().max(40).nullable().optional(),
  activo: z.boolean().optional()
})
