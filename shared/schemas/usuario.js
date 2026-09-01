import { z } from 'zod'

export const usuarioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  rol: z.enum(['jefe', 'trabajador', 'cliente'], { message: 'Rol inválido' }).default('trabajador'),
  telefono: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  salario: z.number().min(0, 'El salario no puede ser negativo').nullable().optional(),
  pin: z.string().min(4, 'El PIN debe tener al menos 4 caracteres').max(6, 'El PIN debe tener máximo 6 caracteres').optional(),
  activo: z.boolean().default(true),
  puestoId: z.string().optional()
})

export const pinResetSchema = z.object({
  pin: z.string().min(4, 'El PIN debe tener al menos 4 dígitos.').max(6, 'El PIN no puede tener más de 6 dígitos.')
})

export const usuarioDbSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  rol: z.enum(['jefe', 'trabajador', 'cliente'], { message: 'Rol inválido' }).default('trabajador'),
  telefono: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  salario: z.number().nullable().optional(),
  pinHash: z.string(),
  activo: z.boolean().default(true),
  puestoId: z.string().optional()
})
