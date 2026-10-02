import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  check
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

/**
 * Tipos de union como constantes de texto (SQLite no soporta enums nativos).
 * Se aplican con CHECK constraints en la inicialización de la base.
 */
export const ROLES = ['jefe', 'trabajador', 'cliente'] as const
export const ESTADOS_CUADRE = ['abierto', 'cerrado'] as const
export const TIPOS_LINEA = ['normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar'] as const
export const TIPOS_AJUSTE = ['regalo', 'descuento'] as const
export const TIPOS_MOVIMIENTO = [
  'entrada',
  'traspaso',
  'venta',
  'merma',
  'devolucion',
  'anulacion'
] as const

export type Rol = (typeof ROLES)[number]
export type EstadoCuadre = (typeof ESTADOS_CUADRE)[number]
export type TipoLinea = (typeof TIPOS_LINEA)[number]
export type TipoAjuste = (typeof TIPOS_AJUSTE)[number]
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number]

/**
 * Puestos: espejo de la tabla del servidor para uso offline.
 */
export const puestos = sqliteTable('puestos', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
  creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
})

/**
 * Usuarios: caché local mínima para el jefe/trabajador.
 * pin_hash se guarda para validación offline del PIN.
 */
export const usuarios = sqliteTable(
  'usuarios',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    notas: text('notas'),
    rol: text('rol', { enum: ROLES }).notNull(),
    pinHash: text('pin_hash').notNull(),
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    salario: real('salario'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(true)
  },
  table => ({
    rolIdx: index('usuarios_rol_idx').on(table.rol),
    activoIdx: index('usuarios_activo_idx').on(table.activo),
    puestoNombreUk: uniqueIndex('usuarios_puesto_nombre_uk').on(table.puestoId, table.nombre),
    actualizadoEnIdx: index('usuarios_actualizado_en_idx').on(table.actualizadoEn),
    rolCheck: check('usuarios_rol_check', sql`${table.rol} IN ('jefe', 'trabajador', 'cliente')`)
  })
)

/**
 * Productos del catálogo (réplica de Postgres).
 */
export const productos = sqliteTable(
  'productos',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    activoQuiosco: integer('activo_quiosco', { mode: 'boolean' }).notNull().default(true),
    orden: integer('orden').notNull().default(0),
    precioCompraActual: real('precio_compra_actual').notNull().default(0),
    precioVentaActual: real('precio_venta_actual').notNull().default(0),
    stockMinimoQuiosco: real('stock_minimo_quiosco').notNull().default(0),
    stockRecomendadoQuiosco: real('stock_recomendado_quiosco').notNull().default(0),
    stockMinimoAlmacen: real('stock_minimo_almacen').notNull().default(0),
    unidad: text('unidad'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(true)
  },
  table => ({
    ordenIdx: index('productos_orden_idx').on(table.orden),
    activoIdx: index('productos_activo_idx').on(table.activo),
    actualizadoEnIdx: index('productos_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Historial de precios de productos.
 */
export const historialPrecios = sqliteTable(
  'historial_precios',
  {
    id: text('id').primaryKey(),
    productoId: text('producto_id').notNull(),
    precioCompra: real('precio_compra').notNull(),
    precioVenta: real('precio_venta').notNull(),
    vigenteDesde: integer('vigente_desde', { mode: 'timestamp_ms' }).notNull(),
    vigenteHasta: integer('vigente_hasta', { mode: 'timestamp_ms' }),
    cambiadoPor: text('cambiado_por'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    productoIdx: index('historial_precios_producto_idx').on(table.productoId),
    vigenteIdx: index('historial_precios_vigente_idx').on(table.productoId, table.vigenteHasta),
    creadoEnIdx: index('historial_precios_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Cuadres diarios.
 */
export const cuadres = sqliteTable(
  'cuadres',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    fecha: text('fecha').notNull(), // ISO date YYYY-MM-DD
    jefeId: text('jefe_id').notNull(),
    trabajadorTurnoId: text('trabajador_turno_id'),
    pagoTrabajador: real('pago_trabajador'),
    totalEsperado: real('total_esperado').notNull().default(0),
    totalRealCaja: real('total_real_caja'),
    montoTransferencia: real('monto_transferencia').notNull().default(0),
    montoFiado: real('monto_fiado').notNull().default(0),
    montoCobradoFiado: real('monto_cobrado_fiado').notNull().default(0),
    montoRegalo: real('monto_regalo').notNull().default(0),
    montoDescuento: real('monto_descuento').notNull().default(0),
    diferencia: real('diferencia'),
    costoTotal: real('costo_total'),
    ganancia: real('ganancia'),
    estado: text('estado', { enum: ESTADOS_CUADRE }).notNull().default('abierto'),
    notas: text('notas'),
    cerradoEn: integer('cerrado_en', { mode: 'timestamp_ms' }),
    reabiertoVeces: integer('reabierto_veces').notNull().default(0),
    ultimaReaperturaEn: integer('ultima_reapertura_en', { mode: 'timestamp_ms' }),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    fechaIdx: index('cuadres_fecha_idx').on(table.fecha),
    estadoIdx: index('cuadres_estado_idx').on(table.estado),
    sincIdx: index('cuadres_sincronizado_idx').on(table.sincronizado),
    jefeIdx: index('cuadres_jefe_idx').on(table.jefeId),
    puestoFechaUk: uniqueIndex('cuadres_puesto_fecha_uk').on(table.puestoId, table.fecha),
    actualizadoEnIdx: index('cuadres_actualizado_en_idx').on(table.actualizadoEn),
    estadoCheck: check('cuadres_estado_check', sql`${table.estado} IN ('abierto', 'cerrado')`)
  })
)

/**
 * Líneas de cuadre.
 */
export const cuadreItems = sqliteTable(
  'cuadre_items',
  {
    id: text('id').primaryKey(),
    cuadreId: text('cuadre_id').notNull(),
    productoId: text('producto_id').notNull(),
    precioVentaUsado: real('precio_venta_usado').notNull(),
    cantidad: real('cantidad').notNull().default(0),
    subtotal: real('subtotal').notNull().default(0),
    tipoLinea: text('tipo_linea', { enum: TIPOS_LINEA })
      .notNull()
      .default('normal'),
    nota: text('nota'),
    esExtra: integer('es_extra', { mode: 'boolean' }).notNull().default(false),
    secuencia: integer('secuencia').notNull().default(0),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    cuadreIdx: index('cuadre_items_cuadre_idx').on(table.cuadreId),
    productoIdx: index('cuadre_items_producto_idx').on(table.productoId),
    tipoLineaCheck: check('cuadre_items_tipo_linea_check', sql`${table.tipoLinea} IN ('normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar')`)
  })
)

/**
 * Tabla exclusiva del dispositivo del trabajador.
 * Contiene solo productos activos (id, nombre, precio venta, orden),
 * deliberadamente sin precio_compra, descripción ni historial.
 */
export const productosCache = sqliteTable('productos_cache', {
  id: text('id').primaryKey(),
  nombre: text('nombre').notNull(),
  precioVentaActual: real('precio_venta_actual').notNull(),
  orden: integer('orden').notNull().default(0),
  descargadoEn: integer('descargado_en', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
})

/**
 * Cuentas de fiado.
 */
export const cuentasFiado = sqliteTable(
  'cuentas_fiado',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    clienteId: text('cliente_id').notNull(),
    cuadreOrigenId: text('cuadre_origen_id'),
    montoTotal: real('monto_total').notNull(),
    montoPagado: real('monto_pagado').notNull().default(0),
    // Solo en deudas directas: FIFO congelado al crearse.
    costoTotal: real('costo_total'),
    ganancia: real('ganancia'),
    estado: text('estado', { enum: ['pendiente', 'parcial', 'pagada'] })
      .notNull()
      .default('pendiente'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    clienteIdx: index('cuentas_fiado_cliente_idx').on(table.clienteId),
    estadoIdx: index('cuentas_fiado_estado_idx').on(table.estado),
    cuadreOrigenIdx: index('cuentas_fiado_cuadre_origen_idx').on(table.cuadreOrigenId),
    actualizadoEnIdx: index('cuentas_fiado_actualizado_en_idx').on(table.actualizadoEn),
    estadoCheck: check('cuentas_fiado_estado_check', sql`${table.estado} IN ('pendiente', 'parcial', 'pagada')`)
  })
)

/**
 * Items de cuentas de fiado.
 */
export const cuentasFiadoItems = sqliteTable(
  'cuentas_fiado_items',
  {
    id: text('id').primaryKey(),
    cuentaFiadoId: text('cuenta_fiado_id').notNull(),
    productoId: text('producto_id').notNull(),
    cantidad: real('cantidad').notNull(),
    precioVentaUsado: real('precio_venta_usado').notNull(),
    subtotal: real('subtotal').notNull(),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    cuentaIdx: index('cuentas_fiado_items_cuenta_idx').on(table.cuentaFiadoId),
    productoIdx: index('cuentas_fiado_items_producto_idx').on(table.productoId),
    creadoEnIdx: index('cuentas_fiado_items_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Pagos de fiado.
 */
export const pagosFiado = sqliteTable(
  'pagos_fiado',
  {
    id: text('id').primaryKey(),
    cuentaFiadoId: text('cuenta_fiado_id').notNull(),
    // NULL = cobro directo: el efectivo nunca paso por la gaveta de un cuadre.
    cuadreId: text('cuadre_id'),
    monto: real('monto').notNull(),
    formaPago: text('forma_pago').notNull(),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    cuentaIdx: index('pagos_fiado_cuenta_idx').on(table.cuentaFiadoId),
    cuadreIdx: index('pagos_fiado_cuadre_idx').on(table.cuadreId),
    creadoEnIdx: index('pagos_fiado_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Transferencia: cobro por transferencia dentro de un cuadre (cliente + productos).
 */
export const transferencias = sqliteTable(
  'transferencias',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    clienteId: text('cliente_id').notNull(),
    cuadreId: text('cuadre_id').notNull(),
    montoTotal: real('monto_total').notNull(),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    clienteIdx: index('transferencias_cliente_idx').on(table.clienteId),
    cuadreIdx: index('transferencias_cuadre_idx').on(table.cuadreId),
    actualizadoEnIdx: index('transferencias_actualizado_en_idx').on(table.actualizadoEn),
    sincIdx: index('transferencias_sincronizado_idx').on(table.sincronizado)
  })
)

/**
 * Items de transferencia.
 */
export const transferenciaItems = sqliteTable(
  'transferencia_items',
  {
    id: text('id').primaryKey(),
    transferenciaId: text('transferencia_id').notNull(),
    productoId: text('producto_id').notNull(),
    cantidad: real('cantidad').notNull(),
    precioVentaUsado: real('precio_venta_usado').notNull(),
    subtotal: real('subtotal').notNull(),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    transferenciaIdx: index('transferencia_items_transferencia_idx').on(table.transferenciaId),
    productoIdx: index('transferencia_items_producto_idx').on(table.productoId),
    creadoEnIdx: index('transferencia_items_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Ajustes del cuadre: regalos y descuentos.
 */
export const ajustes = sqliteTable(
  'ajustes',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    cuadreId: text('cuadre_id').notNull(),
    clienteId: text('cliente_id'),
    productoId: text('producto_id').notNull(),
    tipo: text('tipo', { enum: TIPOS_AJUSTE }).notNull(),
    cantidad: real('cantidad').notNull(),
    monto: real('monto').notNull(),
    nota: text('nota'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    cuadreIdx: index('ajustes_cuadre_idx').on(table.cuadreId),
    clienteIdx: index('ajustes_cliente_idx').on(table.clienteId),
    productoIdx: index('ajustes_producto_idx').on(table.productoId),
    actualizadoEnIdx: index('ajustes_actualizado_en_idx').on(table.actualizadoEn),
    sincIdx: index('ajustes_sincronizado_idx').on(table.sincronizado),
    tipoCheck: check('ajustes_tipo_check', sql`${table.tipo} IN ('regalo', 'descuento')`)
  })
)

/**
 * Proveedores: catálogo opcional de lugares de compra.
 */
export const proveedores = sqliteTable(
  'proveedores',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    nombre: text('nombre').notNull(),
    telefono: text('telefono'),
    // Lugar donde está la tienda del proveedor. Llega al lote como lugar_compra.
    lugar: text('lugar'),
    notas: text('notas'),
    activo: integer('activo', { mode: 'boolean' }).notNull().default(true),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    puestoIdx: index('proveedores_puesto_idx').on(table.puestoId),
    nombreUk: uniqueIndex('proveedores_puesto_nombre_uk').on(table.puestoId, table.nombre),
    actualizadoEnIdx: index('proveedores_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Lotes de compra: INMUTABLES una vez que tienen consumo.
 */
export const lotes = sqliteTable(
  'lotes',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    productoId: text('producto_id').notNull(),
    proveedorId: text('proveedor_id'),
    lugarCompra: text('lugar_compra'),
    fechaEntrada: text('fecha_entrada').notNull(),
    cantidadInicial: integer('cantidad_inicial').notNull(),
    precioUnitario: real('precio_unitario').notNull(),
    detalleCompra: text('detalle_compra'),
    entradaRef: text('entrada_ref'),
    anulado: integer('anulado', { mode: 'boolean' }).notNull().default(false),
    notas: text('notas'),
    creadoPor: text('creado_por'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    productoIdx: index('lotes_producto_idx').on(table.productoId),
    fifoIdx: index('lotes_fifo_idx').on(table.productoId, table.fechaEntrada, table.creadoEn),
    puestoIdx: index('lotes_puesto_idx').on(table.puestoId),
    entradaRefIdx: index('lotes_entrada_ref_idx').on(table.entradaRef),
    actualizadoEnIdx: index('lotes_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Traspasos almacén → quiosco.
 */
export const traspasos = sqliteTable(
  'traspasos',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    fecha: text('fecha').notNull(),
    desde: text('desde').notNull().default('almacen'),
    hasta: text('hasta').notNull().default('quiosco'),
    notas: text('notas'),
    usuarioId: text('usuario_id'),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    puestoIdx: index('traspasos_puesto_idx').on(table.puestoId),
    fechaIdx: index('traspasos_fecha_idx').on(table.fecha),
    actualizadoEnIdx: index('traspasos_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Movimientos de inventario: libro append-only.
 */
export const movimientosInventario = sqliteTable(
  'movimientos_inventario',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    productoId: text('producto_id').notNull(),
    loteId: text('lote_id'),
    cuadreId: text('cuadre_id'),
    lineaCuadreId: text('linea_cuadre_id'),
    traspasoId: text('traspaso_id'),
    ventaDirectaId: text('venta_directa_id'),
    tipo: text('tipo', { enum: TIPOS_MOVIMIENTO }).notNull(),
    cantidad: integer('cantidad').notNull(),
    deltaAlmacen: integer('delta_almacen').notNull().default(0),
    deltaQuiosco: integer('delta_quiosco').notNull().default(0),
    precioUnitario: real('precio_unitario').notNull(),
    importe: real('importe').notNull(),
    motivo: text('motivo'),
    nota: text('nota'),
    usuarioId: text('usuario_id'),
    anulado: integer('anulado', { mode: 'boolean' }).notNull().default(false),
    anuladoPor: text('anulado_por'),
    anuladoEn: integer('anulado_en', { mode: 'timestamp_ms' }),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    productoQuioscoIdx: index('mov_producto_quiosco_idx').on(table.productoId, table.anulado),
    productoAlmacenIdx: index('mov_producto_almacen_idx').on(
      table.productoId,
      table.anulado,
      table.deltaAlmacen
    ),
    cuadreIdx: index('mov_cuadre_idx').on(table.cuadreId),
    loteIdx: index('mov_lote_idx').on(table.loteId),
    puestoFechaIdx: index('mov_puesto_fecha_idx').on(table.puestoId, table.creadoEn),
    tipoCheck: check(
      'movimientos_tipo_check',
      sql`${table.tipo} IN ('entrada','traspaso','venta','merma','devolucion','anulacion')`
    )
  })
)

/**
 * Ventas directas: ventas en efectivo hechas por el jefe fuera del cuadre
 * (quiosco cerrado, cliente que llega a la casa, etc.).
 *
 * No pertenecen a ningún cuadre, así que no entran a la gaveta ni al corte del
 * día: el efectivo se queda en el bolsillo de quien cobra. Son su propio
 * registro para poder verlos en la gráfica de ingresos directos.
 *
 * costoTotal/ganancia se calculan por FIFO al vender y quedan congelados,
 * igual que al cerrar un cuadre: cambiar después el precio de compra no debe
 * alterar lo ya vendido.
 */
export const ventasDirectas = sqliteTable(
  'ventas_directas',
  {
    id: text('id').primaryKey(),
    puestoId: text('puesto_id').notNull(),
    ubicacionVenta: text('ubicacion_venta', { enum: ['almacen', 'quiosco'] })
      .notNull()
      .default('almacen'),
    montoTotal: real('monto_total').notNull(),
    costoTotal: real('costo_total').notNull(),
    ganancia: real('ganancia').notNull(),
    notas: text('notas'),
    usuarioId: text('usuario_id').notNull(),
    anulado: integer('anulado', { mode: 'boolean' }).notNull().default(false),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    actualizadoEn: integer('actualizado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    puestoFechaIdx: index('ventas_directas_puesto_fecha_idx').on(table.puestoId, table.creadoEn),
    creadoEnIdx: index('ventas_directas_creado_en_idx').on(table.creadoEn),
    ubicacionCheck: check(
      'ventas_directas_ubicacion_check',
      sql`${table.ubicacionVenta} IN ('almacen','quiosco')`
    )
  })
)

/**
 * Líneas de una venta directa: producto, cantidad, precio de venta y el costo
 * FIFO que consumió. El costo va por línea para poder auditar la ganancia.
 */
export const ventasDirectasItems = sqliteTable(
  'ventas_directas_items',
  {
    id: text('id').primaryKey(),
    ventaDirectaId: text('venta_directa_id').notNull(),
    productoId: text('producto_id').notNull(),
    cantidad: integer('cantidad').notNull(),
    precioVentaUsado: real('precio_venta_usado').notNull(),
    subtotal: real('subtotal').notNull(),
    costoUnitario: real('costo_unitario').notNull(),
    costoTotal: real('costo_total').notNull(),
    secuencia: integer('secuencia').notNull().default(0),
    creadoEn: integer('creado_en', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    sincronizado: integer('sincronizado', { mode: 'boolean' })
      .notNull()
      .default(false)
  },
  table => ({
    ventaIdx: index('ventas_directas_items_venta_idx').on(table.ventaDirectaId),
    productoIdx: index('ventas_directas_items_producto_idx').on(table.productoId)
  })
)

/**
 * Tipos inferidos.
 */
export type PuestoSQLite = typeof puestos.$inferSelect
export type UsuarioSQLite = typeof usuarios.$inferSelect
export type ProductoSQLite = typeof productos.$inferSelect
export type CuadreSQLite = typeof cuadres.$inferSelect
export type CuadreItemSQLite = typeof cuadreItems.$inferSelect
export type ProductoCache = typeof productosCache.$inferSelect
export type CuentaFiadoSQLite = typeof cuentasFiado.$inferSelect
export type CuentaFiadoItemSQLite = typeof cuentasFiadoItems.$inferSelect
export type PagoFiadoSQLite = typeof pagosFiado.$inferSelect
export type TransferenciaSQLite = typeof transferencias.$inferSelect
export type TransferenciaItemSQLite = typeof transferenciaItems.$inferSelect
export type AjusteSQLite = typeof ajustes.$inferSelect
export type ProveedorSQLite = typeof proveedores.$inferSelect
export type LoteSQLite = typeof lotes.$inferSelect
export type TraspasoSQLite = typeof traspasos.$inferSelect
export type MovimientoInventarioSQLite = typeof movimientosInventario.$inferSelect
export type VentaDirectaSQLite = typeof ventasDirectas.$inferSelect
export type VentaDirectaItemSQLite = typeof ventasDirectasItems.$inferSelect
