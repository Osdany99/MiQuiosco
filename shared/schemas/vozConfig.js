import { z } from 'zod'

import {
  IDIOMAS_VOZ_FLOTA,
  MOTORES_VOZ,
  VOZ_RETENCION_MAX,
  VOZ_RETENCION_MIN,
  esWakeValido,
  normalizarWake
} from '../voz/config.js'

/**
 * Configuración de flota de la voz.
 *
 * `wake` exige al menos dos palabras: una sola («nova») dispara con cualquier
 * conversación del mostrador. El servicio nativo solo recibe la frase completa.
 */
export const vozConfigSchema = z.object({
  wake: z
    .string()
    .min(3, 'La palabra clave es demasiado corta.')
    .max(40, 'La palabra clave es demasiado larga.')
    .transform(normalizarWake)
    .refine(esWakeValido, 'La palabra clave necesita al menos dos palabras y solo letras.'),
  motor: z.enum(MOTORES_VOZ),
  idioma: z.enum(IDIOMAS_VOZ_FLOTA),
  retencionDias: z
    .number()
    .int('La retención debe ser un número entero de días.')
    .min(VOZ_RETENCION_MIN, `La retención mínima es ${VOZ_RETENCION_MIN} días.`)
    .max(VOZ_RETENCION_MAX, `La retención máxima es ${VOZ_RETENCION_MAX} días.`)
}).strict()
