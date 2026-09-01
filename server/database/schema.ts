import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  date,
  pgEnum,
  index,
  uniqueIndex
} from 'drizzle-orm/pg-core'

/**
 * Enumeraciones de la base de datos.
 */
export const rolEnum = pgEnum('rol', ['jefe', 'trabajador', 'cliente'])
export const estadoCuadreEnum = pgEnum('estado_cuadre', ['abierto', 'cerrado'])
export const tipoLineaEnum = pgEnum('tipo_linea', [
  'normal',
  'descuento',
  'regalo',
  'deuda',
  'descuento_familiar'
])
export const estadoCuentaFiadoEnum = pgEnum('estado_cuenta_fiado', [
  'pendiente',
  'parcial',
  'pagada'
])
export const formaPagoFiadoEnum = pgEnum('forma_pago_fiado', [
  'efectivo',
  'transferencia'
])

/**
 * Puestos: soporte multi-puesto desde el día 1.
 * En la versión inicial existirá un único puesto activo.
 */
export const puestos = pgTable('puestos', {
  id: uuid('id').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  activo: boolean('activo').notNull().default(true),
  creadoEn: timestamp('creado_en', { withTimezone: true })
    .notNull()
    .defaultNow()
})

/**
 * Usuarios del sistema con sus roles.
 * El PIN se guarda siempre hasheado con bcrypt, nunca en texto plano.
 */
export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    notas: text('notas'),
    rol: rolEnum('rol').notNull(),
    pinHash: text('pin_hash').notNull(),
    activo: boolean('activo').notNull().default(true),
    salario: doublePrecision('salario'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    rolIdx: index('usuarios_rol_idx').on(table.rol),
    activoIdx: index('usuarios_activo_idx').on(table.activo),
    puestoNombreUk: uniqueIndex('usuarios_puesto_nombre_uk').on(table.puestoId, table.nombre),
    actualizadoEnIdx: index('usuarios_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Productos del catálogo.
 * precioCompraActual y precioVentaActual son espejo rápido para evitar joins
 * con historial_precios en lecturas frecuentes; el historial completo vive
 * en la tabla historial_precios.
 */
export const productos = pgTable(
  'productos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    activo: boolean('activo').notNull().default(true),
    orden: integer('orden').notNull().default(0),
    precioCompraActual: doublePrecision('precio_compra_actual')
      .notNull()
      .default(0),
    precioVentaActual: doublePrecision('precio_venta_actual')
      .notNull()
      .default(0),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    ordenIdx: index('productos_orden_idx').on(table.orden),
    activoIdx: index('productos_activo_idx').on(table.activo),
    actualizadoEnIdx: index('productos_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Historial de precios de productos.
 * Regla de negocio: al cambiar un precio, el registro vigente
 * (vigente_hasta IS NULL) se cierra con vigente_hasta = ahora(),
 * y se crea un nuevo registro con vigente_hasta = NULL.
 */
export const historialPrecios = pgTable(
  'historial_precios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id, { onDelete: 'cascade' }),
    precioCompra: doublePrecision('precio_compra')
      .notNull(),
    precioVenta: doublePrecision('precio_venta')
      .notNull(),
    vigenteDesde: timestamp('vigente_desde', { withTimezone: true })
      .notNull(),
    vigenteHasta: timestamp('vigente_hasta', { withTimezone: true }),
    cambiadoPor: uuid('cambiado_por').references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    productoIdx: index('historial_precios_producto_idx').on(table.productoId),
    vigenteIdx: index('historial_precios_vigente_idx').on(
      table.productoId,
      table.vigenteHasta
    ),
    creadoEnIdx: index('historial_precios_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Cuadres diarios del puesto.
 * El estado controla si se puede editar (abierto) o solo leer (cerrado).
 */
export const cuadres = pgTable(
  'cuadres',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    fecha: date('fecha').notNull(),
    jefeId: uuid('jefe_id')
      .notNull()
      .references(() => usuarios.id),
    trabajadorTurnoId: uuid('trabajador_turno_id').references(
      () => usuarios.id
    ),
    pagoTrabajador: doublePrecision('pago_trabajador'),
    totalEsperado: doublePrecision('total_esperado').notNull().default(0),
    totalRealCaja: doublePrecision('total_real_caja'),
    montoTransferencia: doublePrecision('monto_transferencia')
      .notNull()
      .default(0),
    montoFiado: doublePrecision('monto_fiado')
      .notNull()
      .default(0),
    montoCobradoFiado: doublePrecision('monto_cobrado_fiado')
      .notNull()
      .default(0),
    diferencia: doublePrecision('diferencia'),
    estado: estadoCuadreEnum('estado').notNull().default('abierto'),
    notas: text('notas'),
    cerradoEn: timestamp('cerrado_en', { withTimezone: true }),
    reabiertoVeces: integer('reabierto_veces').notNull().default(0),
    ultimaReaperturaEn: timestamp('ultima_reapertura_en', {
      withTimezone: true
    }),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    fechaIdx: index('cuadres_fecha_idx').on(table.fecha),
    estadoIdx: index('cuadres_estado_idx').on(table.estado),
    jefeIdx: index('cuadres_jefe_idx').on(table.jefeId),
    puestoFechaUk: uniqueIndex('cuadres_puesto_fecha_uk').on(table.puestoId, table.fecha),
    actualizadoEnIdx: index('cuadres_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Líneas de cada cuadre: productos vendidos con cantidad, precio aplicado,
 * tipo de línea (normal, regalo, descuento familiar) y nota libre.
 * precioVentaUsado es snapshot editable del día, no necesariamente igual
 * al precioVentaActual del producto.
 */
export const cuadreItems = pgTable(
  'cuadre_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cuadreId: uuid('cuadre_id')
      .notNull()
      .references(() => cuadres.id, { onDelete: 'cascade' }),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    precioVentaUsado: doublePrecision('precio_venta_usado').notNull(),
    cantidad: doublePrecision('cantidad')
      .notNull()
      .default(0),
    subtotal: doublePrecision('subtotal').notNull().default(0),
    tipoLinea: tipoLineaEnum('tipo_linea').notNull().default('normal'),
    nota: text('nota'),
    esExtra: boolean('es_extra').notNull().default(false),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuadreIdx: index('cuadre_items_cuadre_idx').on(table.cuadreId),
    productoIdx: index('cuadre_items_producto_idx').on(table.productoId)
  })
)

/**
 * Cuentas de fiado: deuda generada en un cuadre específico.
 * montoTotal = suma de subtotales de cuentas_fiado_items.
 * montoPagado = suma de pagos recibidos contra esta cuenta.
 */
export const cuentasFiado = pgTable(
  'cuentas_fiado',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id),
    cuadreOrigenId: uuid('cuadre_origen_id')
      .notNull()
      .references(() => cuadres.id),
    montoTotal: doublePrecision('monto_total').notNull(),
    montoPagado: doublePrecision('monto_pagado')
      .notNull()
      .default(0),
    estado: estadoCuentaFiadoEnum('estado').notNull().default('pendiente'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    clienteIdx: index('cuentas_fiado_cliente_idx').on(table.clienteId),
    estadoIdx: index('cuentas_fiado_estado_idx').on(table.estado),
    cuadreOrigenIdx: index('cuentas_fiado_cuadre_origen_idx').on(table.cuadreOrigenId),
    actualizadoEnIdx: index('cuentas_fiado_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Items de una cuenta de fiado: productos, cantidades y precios al momento de la deuda.
 */
export const cuentasFiadoItems = pgTable(
  'cuentas_fiado_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cuentaFiadoId: uuid('cuenta_fiado_id')
      .notNull()
      .references(() => cuentasFiado.id, { onDelete: 'cascade' }),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    cantidad: doublePrecision('cantidad').notNull(),
    precioVentaUsado: doublePrecision('precio_venta_usado').notNull(),
    subtotal: doublePrecision('subtotal').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuentaIdx: index('cuentas_fiado_items_cuenta_idx').on(table.cuentaFiadoId),
    productoIdx: index('cuentas_fiado_items_producto_idx').on(table.productoId),
    creadoEnIdx: index('cuentas_fiado_items_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Pagos recibidos contra cuentas de fiado.
 * cuadreId = el cuadre donde se recibe el pago (no necesariamente el de origen de la deuda).
 */
export const pagosFiado = pgTable(
  'pagos_fiado',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cuentaFiadoId: uuid('cuenta_fiado_id')
      .notNull()
      .references(() => cuentasFiado.id, { onDelete: 'cascade' }),
    cuadreId: uuid('cuadre_id')
      .notNull()
      .references(() => cuadres.id),
    monto: doublePrecision('monto').notNull(),
    formaPago: formaPagoFiadoEnum('forma_pago').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuentaIdx: index('pagos_fiado_cuenta_idx').on(table.cuentaFiadoId),
    cuadreIdx: index('pagos_fiado_cuadre_idx').on(table.cuadreId),
    creadoEnIdx: index('pagos_fiado_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Registro de eliminaciones para sincronización.
 * Trackea qué registros fueron eliminados y cuándo, para que otros dispositivos los apliquen en pull.
 */
export const deletedRecords = pgTable(
  'deleted_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tabla: text('tabla').notNull(),
    registroId: text('registro_id').notNull(),
    eliminadoEn: timestamp('eliminado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    tablaIdx: index('deleted_records_tabla_idx').on(table.tabla),
    eliminadoEnIdx: index('deleted_records_eliminado_en_idx').on(table.eliminadoEn)
  })
)

/**
 * Tipos inferidos de las tablas para uso en el código de la app.
 */
export type Puesto = typeof puestos.$inferSelect
export type NuevoPuesto = typeof puestos.$inferInsert
export type Usuario = typeof usuarios.$inferSelect
export type NuevoUsuario = typeof usuarios.$inferInsert
export type Producto = typeof productos.$inferSelect
export type NuevoProducto = typeof productos.$inferInsert
export type HistorialPrecio = typeof historialPrecios.$inferSelect
export type NuevoHistorialPrecio = typeof historialPrecios.$inferInsert
export type Cuadre = typeof cuadres.$inferSelect
export type NuevoCuadre = typeof cuadres.$inferInsert
export type CuadreItem = typeof cuadreItems.$inferSelect
export type NuevoCuadreItem = typeof cuadreItems.$inferInsert
export type CuentaFiado = typeof cuentasFiado.$inferSelect
export type NuevaCuentaFiado = typeof cuentasFiado.$inferInsert
export type CuentaFiadoItem = typeof cuentasFiadoItems.$inferSelect
export type NuevaCuentaFiadoItem = typeof cuentasFiadoItems.$inferInsert
export type PagoFiado = typeof pagosFiado.$inferSelect
export type NuevoPagoFiado = typeof pagosFiado.$inferInsert

export type Rol = 'jefe' | 'trabajador' | 'cliente'
export type EstadoCuadre = 'abierto' | 'cerrado'
export type TipoLinea = 'normal' | 'descuento' | 'regalo' | 'deuda' | 'descuento_familiar'
export type EstadoCuentaFiado = 'pendiente' | 'parcial' | 'pagada'
export type FormaPagoFiado = 'efectivo' | 'transferencia'
