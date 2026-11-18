import { z } from 'zod'

/**
 * Aciertos de voz: una fila por dictado que el intérprete resolvió y la app
 * aplicó. Son material de diagnóstico temporal (para comprobar si el comando
 * «exitoso» entendió lo que el usuario quería), no datos de negocio.
 */
export const aciertoVozSchema = z.object({
  // uuid generado en el cliente: reintentar la subida no duplica la fila.
  id: z.string().uuid(),
  comando: z.string().min(1).max(50),
  resultado: z.string().min(1).max(40),
  detalle: z.string().max(200).nullable().default(null),
  /** Frase cruda; el servidor la descarta si `capturarAciertos` está apagado. */
  texto: z.string().max(300).nullable().default(null),
  confianza: z.number().min(0).max(1).nullable().default(null),
  /** Hora del dictado en el equipo, para no perderla si estuvo días sin red. */
  creadoEn: z.string().datetime({ offset: true }).nullable().default(null)
})

export const aciertosVozSchema = z.object({
  aciertos: z.array(aciertoVozSchema).min(1).max(200)
})

export const filtroAciertosVozSchema = z.object({
  comando: z.string().trim().min(1).max(50).optional(),
  desde: z.enum(['24h', '7d', 'todo']).optional(),
  texto: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional()
})
