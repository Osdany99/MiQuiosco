import { z } from 'zod'

/**
 * Estado que el dispositivo reporta al servidor tras sincronizar.
 *
 * No incluye versión de la app: esa viaja en el header `x-app-version-code`
 * (la misma que usa el gate de versión mínima), así el cuerpo no puede
 * mentir sobre la APK instalada.
 */
export const syncEstadoSchema = z.object({
  /** Filas locales pendientes de subir. */
  pendientes: z.number().int().min(0).max(1_000_000).optional(),
  /** true si el último ciclo de sync terminó completo (push + pull). */
  syncOk: z.boolean().optional(),
  modelo: z.string().trim().max(80).nullish(),
  android: z.string().trim().max(40).nullish(),
  /**
   * Motor de voz con el que está escuchando de verdad. Sirve para que el panel
   * vea un fallback («preferido Vosk, usando sistema») sin adivinarlo.
   */
  vozMotor: z.enum(['vosk', 'sistema', 'google']).nullish(),
  /** El modelo Vosk está extraído y listo en este aparato. */
  vozVosk: z.boolean().nullish(),
  /** El aparato tiene reconocedor del sistema disponible. */
  vozStt: z.boolean().nullish()
})
