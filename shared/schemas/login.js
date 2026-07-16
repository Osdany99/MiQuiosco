import { z } from 'zod'

export const loginSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  pin: z.string().min(4, 'El PIN debe tener al menos 4 dígitos.').max(6, 'El PIN no puede tener más de 6 dígitos.')
})
