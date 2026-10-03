import { z } from 'zod'

/**
 * Alta de recarga Etecsa. Normalmente la crea el pipeline automático
 * (useRecargas.procesarSms) con lo que extrajo el parser; el jefe también
 * puede corregir el cliente después.
 */
export const createRecargaSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido').nullable().optional(),
  telefonoDestino: z.string().regex(/^\d{10}$/, 'Teléfono canónico de 10 dígitos'),
  telefonoRaw: z.string().max(20).nullable().optional(),
  plataforma: z.enum(['monedero', 'banco'], { message: 'Plataforma inválida' }),
  tipo: z.enum(['saldo', 'voz', 'sms', 'datos'], { message: 'Tipo inválido' }).default('saldo'),
  descripcion: z.string().max(200).nullable().optional(),
  unidades: z.number().int().min(0).nullable().optional(),
  montoNominal: z.number().min(0, 'El nominal no puede ser negativo'),
  costo: z.number().min(0, 'El costo no puede ser negativo'),
  ganancia: z.number(),
  idTransaccion: z.string().min(6).max(30).nullable().optional(),
  saldoCarteraCup: z.number().nullable().optional(),
  saldoCarteraUsd: z.number().nullable().optional(),
  estadoPago: z.enum(['pagada', 'pendiente'], { message: 'Estado inválido' }).default('pendiente'),
  montoCobrado: z.number().min(0).default(0),
  smsId: z.string().uuid('ID de SMS inválido').nullable().optional()
})

/** Lo único editable a mano: a quién se le fía y si ya la pagó. */
export const updateRecargaSchema = z.object({
  clienteId: z.string().uuid('ID de cliente inválido').nullable().optional(),
  estadoPago: z.enum(['pagada', 'pendiente'], { message: 'Estado inválido' }).optional(),
  montoCobrado: z.number().min(0).optional()
})
