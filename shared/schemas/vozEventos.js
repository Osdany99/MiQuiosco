import { z } from 'zod'

export const eventoVozCounterSchema = z.object({
  comando: z.string().min(1).max(50),
  motivo: z.string().min(1).max(60),
  plantilla: z.string().max(120).nullable().default(null),
  confianza: z.number().min(0).max(1).nullable().default(null),
  intentos: z.number().int().min(1).max(100000).default(1)
})

export const eventosVozCounterSchema = z.object({
  eventos: z.array(eventoVozCounterSchema).min(1).max(200)
})
