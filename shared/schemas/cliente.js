import { z } from 'zod'

export const clienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(200, 'Máximo 200 caracteres'),
  telefono: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().default(true)
})
