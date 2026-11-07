import { z } from 'zod'
import { esClaveValida, normalizarOverrides } from '../permisos.js'

/**
 * Overrides de permisos por puesto. Solo admite claves conocidas del catálogo
 * con valores booleanos. No normaliza aquí: se rechaza el payload si trae
 * basura, para que un panel desactualizado no corrompa la BD.
 */
export const permisosPuestoSchema = z
  .record(z.string().max(64), z.boolean())
  .refine(obj => Object.keys(obj).length <= 200, 'Demasiadas entradas.')
  .superRefine((obj, ctx) => {
    for (const key of Object.keys(obj)) {
      if (!esClaveValida(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Clave de permiso desconocida: ${key}`,
          path: [key]
        })
      }
    }
  })

/**
 * Convierte a overrides normalizados (defensivo para el cliente).
 */
export function normalizarPermisosPuesto(input) {
  return normalizarOverrides(input)
}
