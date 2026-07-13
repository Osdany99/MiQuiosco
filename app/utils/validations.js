import { z } from 'zod'
import {
  pin as basePin,
  nonNegativeCoerce,
  activoDefaultTrue
} from '../../shared/schemas/_base.js'

/**
 * app/utils/validations.js — Capa de UI sobre los schemas de shared/schemas.
 *
 * Los schemas "puros" viven en `shared/schemas/` y se usan tanto en el server
 * como en la app. Este módulo añade:
 *   - `fields`: factories con mensajes en español para usar en formularios Vue.
 *   - `schemas`: schemas compuestos para casos específicos de UI (ej: pinReset).
 *
 * Si en el futuro quieres usar directamente un schema de `shared/schemas/`,
 * impórtalo desde ahí: `import { createUsuarioSchema } from '~/shared/schemas'`.
 */

export const fields = {
  name: (label = 'El nombre') => z.string().min(1, `${label} es requerido`),
  pin: () => basePin,
  email: () => z.string().email('Correo inválido').optional().nullable(),
  password: (required = false) => required
    ? z.string().min(6, 'Mínimo 6 caracteres')
    : z.string().min(0).optional(),
  description: () => z.string().optional().nullable(),
  phone: () => z.string().optional().nullable(),
  address: () => z.string().optional().nullable(),
  salary: () => z.number().optional().nullable(),
  number: () => nonNegativeCoerce,
  boolean: () => activoDefaultTrue,
  select: (label = 'El campo') => z.string().min(1, `${label} es requerido`)
}

export const schemas = {
  pinReset: z.object({
    pin: basePin
  })
}
