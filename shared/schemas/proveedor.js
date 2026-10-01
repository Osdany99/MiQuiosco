import { z } from 'zod'

export const proveedorSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100),
  telefono: z.string().max(30).nullable().optional(),
  notas: z.string().nullable().optional(),
  activo: z.boolean().default(true)
})
