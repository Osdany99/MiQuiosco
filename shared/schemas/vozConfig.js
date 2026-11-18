import { z } from 'zod'

import {
  IDIOMAS_VOZ_FLOTA,
  MOTORES_VOZ,
  VOZ_RETENCION_ACIERTOS_MAX,
  VOZ_RETENCION_ACIERTOS_MIN,
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
    .max(VOZ_RETENCION_MAX, `La retención máxima es ${VOZ_RETENCION_MAX} días.`),
  /**
   * Guarda la frase cruda de los dictados fallidos. Se apaga a mano: mientras
   * esté encendido, el panel puede mostrar nombres de clientes sin enmascarar.
   */
  capturarTexto: z.boolean().default(false),
  /**
   * Guarda los dictados que la app resolvió bien, con su frase cruda. Es
   * diagnóstico temporal: una fila por dictado y retención corta.
   */
  capturarAciertos: z.boolean().default(false),
  retencionAciertosDias: z
    .number()
    .int('La retención de aciertos debe ser un número entero de días.')
    .min(
      VOZ_RETENCION_ACIERTOS_MIN,
      `La retención mínima de aciertos es ${VOZ_RETENCION_ACIERTOS_MIN} día.`
    )
    .max(
      VOZ_RETENCION_ACIERTOS_MAX,
      `La retención máxima de aciertos es ${VOZ_RETENCION_ACIERTOS_MAX} días.`
    )
    .default(7)
}).strict()

/**
 * Override de voz de un equipo (panel `/admin/dispositivos`).
 *
 * `null` = hereda de la flota. Se pueden pisar motor, idioma y palabra clave;
 * la retención y la captura de diagnóstico son política de flota y no entran
 * aquí a propósito.
 */
export const vozConfigDispositivoSchema = z
  .object({
    motor: z.enum(MOTORES_VOZ).nullish(),
    idioma: z.enum(IDIOMAS_VOZ_FLOTA).nullish(),
    wake: z
      .string()
      .trim()
      .min(3, 'La palabra clave es demasiado corta.')
      .max(40, 'La palabra clave es demasiado larga.')
      .transform(normalizarWake)
      .refine(esWakeValido, 'La palabra clave necesita al menos dos palabras y solo letras.')
      .nullish()
  })
  .strict()

/** Mismo override aplicado de una vez a todos los equipos de un puesto. */
export const vozConfigPuestoSchema = vozConfigDispositivoSchema.extend({
  puestoId: z.string().uuid('Puesto inválido.')
})
