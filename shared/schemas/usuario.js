import { z } from 'zod'

/**
 * Esquema de usuario.
 *
 * Los defaults de `rol` y `activo` viven en `usuarioSchema` (create) y NO en el
 * `partial()` que usan los PATCH. Con un `.default()` dentro del objeto base,
 * `usuarioSchema.partial()` rellena tambien los campos ausentes: un
 * `PATCH { notas: 'x' }` se Guardaba como `{ notas: 'x', rol: 'trabajador' }` y
 * degradaba al jefe en silencio, dejandolo sin token de sync y sin acceso a
 * ninguna vista de jefe. Para el update se usa `usuarioUpdateSchema`, que no
 * aplica defaults.
 */
const camposOpcionales = {
  telefono: z.string().nullable().optional(),
  notas: z.string().nullable().optional(),
  salario: z.number().min(0, 'El salario no puede ser negativo').nullable().optional(),
  pin: z.string().min(4, 'El PIN debe tener al menos 4 caracteres').max(6, 'El PIN debe tener máximo 6 caracteres').optional(),
  puestoId: z.string().optional()
}

/** Alta: `nombre`, `rol` y `activo` con valor por defecto. */
export const usuarioSchema = z.object({
  ...camposOpcionales,
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres'),
  rol: z.enum(['jefe', 'trabajador', 'cliente'], { message: 'Rol inválido' }).default('trabajador'),
  activo: z.boolean().default(true)
})

/**
 * Actualización: los mismos campos pero TODOS opcionales y SIN defaults. Un PATCH
 * solo toca lo que viene en el body, así que omitir un campo no puede resetearlo
 * ni exigirlo.
 */
export const usuarioUpdateSchema = z.object({
  ...camposOpcionales,
  nombre: z.string().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres').optional(),
  rol: z.enum(['jefe', 'trabajador', 'cliente'], { message: 'Rol inválido' }).optional(),
  activo: z.boolean().optional()
})

export const pinResetSchema = z.object({
  pin: z.string().min(4, 'El PIN debe tener al menos 4 dígitos.').max(6, 'El PIN no puede tener más de 6 dígitos.')
})

/** Forma de la fila en Postgres (con el hash ya calculado). */
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
