import { z } from 'zod'
import { pin as basePin } from '../../shared/schemas/_base.js'

/**
 * app/utils/validations.js — Capa de UI sobre los schemas de shared/schemas.
 *
 * Los schemas "puros" viven en `shared/schemas/` y se usan tanto en el server
 * como en la app. Este módulo añade schemas compuestos para casos específicos
 * de UI (ej: pinReset).
 *
 * Si en el futuro quieres usar directamente un schema de `shared/schemas/`,
 * impórtalo desde ahí: `import { createUsuarioSchema } from '~/shared/schemas'`.
 */

export const schemas = {
  pinReset: z.object({
    pin: basePin
  })
}
