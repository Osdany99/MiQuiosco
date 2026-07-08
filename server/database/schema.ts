import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  pgEnum,
  index
} from 'drizzle-orm/pg-core'

/**
 * Enumeraciones de la base de datos.
 */
export const rolEnum = pgEnum('rol', ['jefe', 'trabajador'])
export const estadoCuadreEnum = pgEnum('estado_cuadre', ['abierto', 'cerrado'])
export const tipoLineaEnum = pgEnum('tipo_linea', [
  'normal',
  'descuento'
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
    rol: rolEnum('rol').notNull(),
    pinHash: text('pin_hash').notNull(),
    activo: boolean('activo').notNull().default(true),
    salario: numeric('salario', { precision: 10, scale: 2 }).notNull().default('600'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    rolIdx: index('usuarios_rol_idx').on(table.rol),
    activoIdx: index('usuarios_activo_idx').on(table.activo)
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
    precioCompraActual: numeric('precio_compra_actual', {
      precision: 10,
      scale: 2
    })
      .notNull()
      .default('0'),
    precioVentaActual: numeric('precio_venta_actual', {
      precision: 10,
      scale: 2
    })
      .notNull()
      .default('0'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    ordenIdx: index('productos_orden_idx').on(table.orden),
    activoIdx: index('productos_activo_idx').on(table.activo)
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
    precioCompra: numeric('precio_compra', { precision: 10, scale: 2 })
      .notNull(),
    precioVenta: numeric('precio_venta', { precision: 10, scale: 2 })
      .notNull(),
    vigenteDesde: timestamp('vigente_desde', { withTimezone: true })
      .notNull(),
    vigenteHasta: timestamp('vigente_hasta', { withTimezone: true }),
    cambiadoPor: uuid('cambiado_por').references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    productoIdx: index('historial_precios_producto_idx').on(table.productoId),
    vigenteIdx: index('historial_precios_vigente_idx').on(
      table.productoId,
      table.vigenteHasta
    )
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
    pagoTrabajador: numeric('pago_trabajador', { precision: 10, scale: 2 }),
    totalEsperado: numeric('total_esperado', {
      precision: 10,
      scale: 2
    }).notNull(),
    totalRealCaja: numeric('total_real_caja', { precision: 10, scale: 2 }),
    montoTransferencia: numeric('monto_transferencia', {
      precision: 10,
      scale: 2
    })
      .notNull()
      .default('0'),
    montoFiado: numeric('monto_fiado', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    montoCobradoFiado: numeric('monto_cobrado_fiado', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    diferencia: numeric('diferencia', { precision: 10, scale: 2 }),
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
    jefeIdx: index('cuadres_jefe_idx').on(table.jefeId)
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
    precioVentaUsado: numeric('precio_venta_usado', {
      precision: 10,
      scale: 2
    }).notNull(),
    cantidad: numeric('cantidad', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
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
 * Clientes: personas que compran fiado.
 */
export const clientes = pgTable(
  'clientes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    notas: text('notas'),
    activo: boolean('activo').notNull().default(true),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    puestoIdx: index('clientes_puesto_idx').on(table.puestoId),
    activoIdx: index('clientes_activo_idx').on(table.activo)
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
      .references(() => clientes.id),
    cuadreOrigenId: uuid('cuadre_origen_id')
      .notNull()
      .references(() => cuadres.id),
    montoTotal: numeric('monto_total', { precision: 10, scale: 2 }).notNull(),
    montoPagado: numeric('monto_pagado', { precision: 10, scale: 2 })
      .notNull()
      .default('0'),
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
    cuadreOrigenIdx: index('cuentas_fiado_cuadre_origen_idx').on(table.cuadreOrigenId)
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
    cantidad: numeric('cantidad', { precision: 10, scale: 2 }).notNull(),
    precioVentaUsado: numeric('precio_venta_usado', { precision: 10, scale: 2 }).notNull(),
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuentaIdx: index('cuentas_fiado_items_cuenta_idx').on(table.cuentaFiadoId),
    productoIdx: index('cuentas_fiado_items_producto_idx').on(table.productoId)
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
    monto: numeric('monto', { precision: 10, scale: 2 }).notNull(),
    formaPago: formaPagoFiadoEnum('forma_pago').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuentaIdx: index('pagos_fiado_cuenta_idx').on(table.cuentaFiadoId),
    cuadreIdx: index('pagos_fiado_cuadre_idx').on(table.cuadreId)
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
export type Cliente = typeof clientes.$inferSelect
export type NuevoCliente = typeof clientes.$inferInsert
export type CuentaFiado = typeof cuentasFiado.$inferSelect
export type NuevaCuentaFiado = typeof cuentasFiado.$inferInsert
export type CuentaFiadoItem = typeof cuentasFiadoItems.$inferSelect
export type NuevaCuentaFiadoItem = typeof cuentasFiadoItems.$inferInsert
export type PagoFiado = typeof pagosFiado.$inferSelect
export type NuevoPagoFiado = typeof pagosFiado.$inferInsert

export type Rol = 'jefe' | 'trabajador'
export type EstadoCuadre = 'abierto' | 'cerrado'
export type TipoLinea = 'normal' | 'descuento'
export type EstadoCuentaFiado = 'pendiente' | 'parcial' | 'pagada'
export type FormaPagoFiado = 'efectivo' | 'transferencia'
