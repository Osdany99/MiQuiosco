import { z } from 'zod'
import { LEXICO_BASE } from '../voz/lexico.js'
import { VISTAS_CON_RUTA } from '../permisos.js'

/** Comandos que el intérprete puede devolver. `desconocido` = no se actúa. */
export const voiceCommandId = z.enum(['venta_directa', 'venta_fiada', 'consulta_stock', 'consulta_precio', 'consulta_deuda', 'consulta_dia', 'repetir', 'ayuda', 'navegacion', 'desconocido'], {
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

/**
 * Slots de `consulta_deuda`. `clienteHint` vacío significa "todas las deudas";
 * `ambito` decide si se responde por un cliente, el total o el que más debe.
 */
export const deudaSlotsSchema = z.object({
  clienteHint: z.string().default(''),
  ambito: z.enum(['cliente', 'total', 'mayor']).default('total')
})

/**
 * Slots de `venta_fiada`. No lleva precio dictado: el fiado usa el precio del
 * catálogo (un precio hablado en una deuda es demasiado fácil de confundir).
 */
export const fiadoSlotsSchema = z.object({
  productoHint: z.string().default(''),
  cantidad: z.number().int().min(1).default(1),
  ubicacion: z.enum(['almacen', 'quiosco']).nullable().default(null),
  clienteHint: z.string().default('')
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
    comando: z.literal('venta_fiada'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: fiadoSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_stock'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: consultaSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_precio'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: consultaSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_deuda'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: deudaSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_dia'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
  }),
  z.object({
    comando: z.literal('repetir'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
  }),
  z.object({
    comando: z.literal('ayuda'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
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
