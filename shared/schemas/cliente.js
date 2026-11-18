import { z } from 'zod'

/**
 * Cliente del negocio. Antes eran `usuarios.rol='cliente'`; ahora es su propia
 * tabla para poder tener 1:N teléfonos (el tope de 360 CUP es por número).
 *
 * A diferencia de `usuarios`, no tiene PIN ni rol: un cliente no entra a la app.
 */
export const clienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  notas: z.string().max(500, 'Máximo 500 caracteres').nullable().optional(),
  activo: z.boolean().default(true),
  /**
   * Cliente centinela del puesto ("Sin cliente"). Solo lo pone la app al
   * asegurar el centinela; el usuario no lo edita.
   */
  esCentinela: z.boolean().optional(),
  puestoId: z.string().optional()
})
