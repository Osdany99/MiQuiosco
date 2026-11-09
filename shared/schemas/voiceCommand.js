import { z } from 'zod'
import { LEXICO_BASE } from '../voz/lexico.js'
import { VISTAS_CON_RUTA } from '../permisos.js'

/** Comandos que el intérprete puede devolver. `desconocido` = no se actúa. */
export const voiceCommandId = z.enum(['venta_directa', 'consulta_stock', 'navegacion', 'desconocido'], {
  message: 'Comando de voz no soportado'
})

/**
 * Slots de `venta_directa`. `ubicacion` es nullable a propósito: null significa
 * "no se dijo", y es la UI quien decide la ubicación por contexto.
 */
export const voiceSlotsSchema = z.object({
  productoHint: z.string().default(''),
  cantidad: z.number().int().min(1).default(1),
  precioUnitario: z.number().min(0).nullable().default(null),
  ubicacion: z.enum(['almacen', 'quiosco']).nullable().default(null),
  tipoVenta: z.enum(['directa', 'casa', 'familiar', 'regalo']).default('directa'),
  clienteHint: z.string().nullable().default(null),
  alternativaTipo: z
    .object({
      productoHint: z.string(),
      tipoVenta: z.enum(['directa', 'casa', 'familiar', 'regalo'])
    })
    .nullable()
    .default(null)
})

export const ventaSlotsSchema = voiceSlotsSchema

export const consultaSlotsSchema = z.object({
  productoHint: z.string().min(1),
  ubicacion: z.enum(['almacen', 'quiosco']).nullable().default(null)
})

const vistasKeys = new Set(VISTAS_CON_RUTA.map(v => v.key))
export const DESTINOS_VALIDOS = Object.keys(LEXICO_BASE.destinos || {}).filter(k => vistasKeys.has(k))

export const navegacionSlotsSchema = z.object({
  destino: z.enum(DESTINOS_VALIDOS)
})

export const voiceCommandSchema = z.discriminatedUnion('comando', [
  z.object({
    comando: z.literal('venta_directa'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: voiceSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_stock'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: consultaSlotsSchema
  }),
  z.object({
    comando: z.literal('navegacion'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: navegacionSlotsSchema
  }),
  z.object({
    comando: z.literal('desconocido'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
  })
])
