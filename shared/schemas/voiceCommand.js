import { z } from 'zod'

/** Comandos que el intérprete puede devolver. `desconocido` = no se actúa. */
export const voiceCommandId = z.enum(['venta_directa', 'venta_fiada', 'cobro_deuda', 'consulta_stock', 'consulta_precio', 'consulta_deuda', 'consulta_dia', 'consulta_ganancia', 'consulta_caja', 'entrada_inventario', 'cambio_precio', 'cuadre_accion', 'traspaso', 'cliente_alta', 'repetir', 'ayuda', 'desconocido'], {
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

/**
 * Slots de `cobro_deuda`. `monto` es `'todo'` o el importe dicho; nunca lleva
 * producto porque cobrar no mueve inventario.
 */
export const cobroSlotsSchema = z.object({
  clienteHint: z.string().default(''),
  monto: z.union([z.literal('todo'), z.number().positive()]).default('todo'),
  formaPago: z.enum(['efectivo', 'transferencia']).default('efectivo')
})

/**
 * Slots de los comandos ASISTIDOS (fases K, L, M, N). Ninguno escribe: la UI
 * prellena un formulario y el jefe confirma con el botón.
 *
 * - `entrada_inventario`: producto, cantidad y costo de compra (null = usar el
 *   último pagado, que el diálogo muestra).
 * - `cambio_precio`: producto y precio nuevo (null = no se oyó la cifra).
 * - `cuadre_accion`: abrir o cerrar; cerrar nunca ejecuta, solo avisa.
 * - `traspaso`: producto, cantidad y destino (el origen es el almacén).
 */
export const entradaSlotsSchema = z.object({
  productoHint: z.string().default(''),
  cantidad: z.number().int().min(1).default(1),
  precioUnitario: z.number().positive().nullable().default(null)
})

export const cambioPrecioSlotsSchema = z.object({
  productoHint: z.string().default(''),
  precio: z.number().positive().nullable().default(null)
})

export const cuadreAccionSlotsSchema = z.object({
  accion: z.enum(['abrir', 'cerrar']).default('abrir')
})

export const traspasoSlotsSchema = z.object({
  productoHint: z.string().default(''),
  cantidad: z.number().int().min(1).default(1),
  destino: z.enum(['almacen', 'quiosco']).default('quiosco')
})

/** Alta de cliente: solo el nombre (se puede corregir en el formulario). */
export const clienteAltaSlotsSchema = z.object({
  nombre: z.string().default('')
})

export const consultaFechaSlotsSchema = z.object({
  /** Día pedido (`2026-11-10`) o null para hoy. */
  fecha: z.string().nullable().default(null)
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
    comando: z.literal('cobro_deuda'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: cobroSlotsSchema
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
    slots: consultaFechaSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_ganancia'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: consultaFechaSlotsSchema
  }),
  z.object({
    comando: z.literal('consulta_caja'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
  }),
  z.object({
    comando: z.literal('cuadre_accion'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: cuadreAccionSlotsSchema
  }),
  z.object({
    comando: z.literal('entrada_inventario'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: entradaSlotsSchema
  }),
  z.object({
    comando: z.literal('cambio_precio'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: cambioPrecioSlotsSchema
  }),
  z.object({
    comando: z.literal('traspaso'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: traspasoSlotsSchema
  }),
  z.object({
    comando: z.literal('cliente_alta'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: clienteAltaSlotsSchema
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
    comando: z.literal('desconocido'),
    transcript: z.string().default(''),
    confidence: z.number().min(0).max(1).default(0),
    slots: z.object({}).default({})
  })
])
