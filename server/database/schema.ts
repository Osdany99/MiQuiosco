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
export const tipoAjusteEnum = pgEnum('tipo_ajuste', ['regalo', 'descuento'])
export const tipoMovimientoEnum = pgEnum('tipo_movimiento', [
  'entrada',
  'traspaso',
  'venta',
  'merma',
  'devolucion',
  'anulacion'
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
    stockMinimoQuiosco: doublePrecision('stock_minimo_quiosco')
      .notNull()
      .default(0),
    stockRecomendadoQuiosco: doublePrecision('stock_recomendado_quiosco')
      .notNull()
      .default(0),
    stockMinimoAlmacen: doublePrecision('stock_minimo_almacen')
      .notNull()
      .default(0),
    unidad: text('unidad'),
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
    montoRegalo: doublePrecision('monto_regalo')
      .notNull()
      .default(0),
    montoDescuento: doublePrecision('monto_descuento')
      .notNull()
      .default(0),
    diferencia: doublePrecision('diferencia'),
    costoTotal: doublePrecision('costo_total'),
    ganancia: doublePrecision('ganancia'),
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
    secuencia: integer('secuencia').notNull().default(0),
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
 * Transferencia: cobro recibido por transferencia bancaria/móvil dentro de un
 * cuadre. A diferencia del fiado, aquí el cliente paga al momento (dinero que
 * se suma a montoTransferencia del cuadre); el registro guarda cliente y
 * productos para control y trazabilidad.
 */
export const transferencias = pgTable(
  'transferencias',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    clienteId: uuid('cliente_id')
      .notNull()
      .references(() => usuarios.id),
    cuadreId: uuid('cuadre_id')
      .notNull()
      .references(() => cuadres.id),
    montoTotal: doublePrecision('monto_total').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    clienteIdx: index('transferencias_cliente_idx').on(table.clienteId),
    cuadreIdx: index('transferencias_cuadre_idx').on(table.cuadreId),
    actualizadoEnIdx: index('transferencias_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Items de una transferencia: productos, cantidades y precios al momento cobrado.
 */
export const transferenciaItems = pgTable(
  'transferencia_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transferenciaId: uuid('transferencia_id')
      .notNull()
      .references(() => transferencias.id, { onDelete: 'cascade' }),
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
    transferenciaIdx: index('transferencia_items_transferencia_idx').on(table.transferenciaId),
    productoIdx: index('transferencia_items_producto_idx').on(table.productoId),
    creadoEnIdx: index('transferencia_items_creado_en_idx').on(table.creadoEn)
  })
)

/**
 * Ajustes del cuadre: productos regalados o vendidos con descuento.
 * monto = el importe que se resta del total esperado (regalo: costo del
 * producto regalado; descuento: el monto descontado). Consumen también del
 * tope por producto compartido con fiado y transferencia.
 */
export const ajustes = pgTable(
  'ajustes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    cuadreId: uuid('cuadre_id')
      .notNull()
      .references(() => cuadres.id),
    clienteId: uuid('cliente_id').references(() => usuarios.id),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    tipo: tipoAjusteEnum('tipo').notNull(),
    cantidad: doublePrecision('cantidad').notNull(),
    monto: doublePrecision('monto').notNull(),
    nota: text('nota'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    cuadreIdx: index('ajustes_cuadre_idx').on(table.cuadreId),
    clienteIdx: index('ajustes_cliente_idx').on(table.clienteId),
    productoIdx: index('ajustes_producto_idx').on(table.productoId),
    actualizadoEnIdx: index('ajustes_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Proveedores: catálogo opcional de lugares de compra.
 * Si no se elige proveedor, el lote guarda lugar_compra como texto libre.
 */
export const proveedores = pgTable(
  'proveedores',
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
    puestoIdx: index('proveedores_puesto_idx').on(table.puestoId),
    nombreUk: uniqueIndex('proveedores_puesto_nombre_uk').on(table.puestoId, table.nombre),
    actualizadoEnIdx: index('proveedores_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Lotes de compra: cada entrada al almacén crea un lote por producto.
 * INMUTABLE: nunca se actualiza el precio una vez que el lote tiene consumo.
 * precioUnitario es el costo congelado de este lote (base del FIFO).
 */
export const lotes = pgTable(
  'lotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    proveedorId: uuid('proveedor_id').references(() => proveedores.id),
    lugarCompra: text('lugar_compra'),
    fechaEntrada: date('fecha_entrada').notNull(),
    cantidadInicial: integer('cantidad_inicial').notNull(),
    precioUnitario: doublePrecision('precio_unitario').notNull(),
    detalleCompra: text('detalle_compra'),
    entradaRef: uuid('entrada_ref'),
    anulado: boolean('anulado').notNull().default(false),
    notas: text('notas'),
    creadoPor: uuid('creado_por').references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    productoIdx: index('lotes_producto_idx').on(table.productoId),
    fifoIdx: index('lotes_fifo_idx').on(
      table.productoId,
      table.fechaEntrada,
      table.creadoEn
    ),
    puestoIdx: index('lotes_puesto_idx').on(table.puestoId),
    entradaRefIdx: index('lotes_entrada_ref_idx').on(table.entradaRef),
    actualizadoEnIdx: index('lotes_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Traspasos almacén → quiosco: cabecera que agrupa movimientos.
 * Los efectos reales están en movimientos_inventario.
 */
export const traspasos = pgTable(
  'traspasos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    fecha: date('fecha').notNull(),
    desde: text('desde').notNull().default('almacen'),
    hasta: text('hasta').notNull().default('quiosco'),
    notas: text('notas'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    puestoIdx: index('traspasos_puesto_idx').on(table.puestoId),
    fechaIdx: index('traspasos_fecha_idx').on(table.fecha),
    actualizadoEnIdx: index('traspasos_actualizado_en_idx').on(table.actualizadoEn)
  })
)

/**
 * Movimientos de inventario: libro append-only, única fuente de la verdad.
 * Regla de oro: nunca se edita ni se borra; las correcciones son movimientos
 * de tipo 'anulacion' con deltas invertidos.
 */
export const movimientosInventario = pgTable(
  'movimientos_inventario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    puestoId: uuid('puesto_id')
      .notNull()
      .references(() => puestos.id),
    productoId: uuid('producto_id')
      .notNull()
      .references(() => productos.id),
    loteId: uuid('lote_id').references(() => lotes.id),
    cuadreId: uuid('cuadre_id').references(() => cuadres.id),
    lineaCuadreId: uuid('linea_cuadre_id').references(() => cuadreItems.id, {
      onDelete: 'set null'
    }),
    traspasoId: uuid('traspaso_id').references(() => traspasos.id),
    tipo: tipoMovimientoEnum('tipo').notNull(),
    cantidad: integer('cantidad').notNull(),
    deltaAlmacen: integer('delta_almacen').notNull().default(0),
    deltaQuiosco: integer('delta_quiosco').notNull().default(0),
    precioUnitario: doublePrecision('precio_unitario').notNull(),
    importe: doublePrecision('importe').notNull(),
    motivo: text('motivo'),
    nota: text('nota'),
    usuarioId: uuid('usuario_id').references(() => usuarios.id),
    anulado: boolean('anulado').notNull().default(false),
    anuladoPor: uuid('anulado_por').references(() => usuarios.id),
    anuladoEn: timestamp('anulado_en', { withTimezone: true }),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
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
    puestoFechaIdx: index('mov_puesto_fecha_idx').on(table.puestoId, table.creadoEn)
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
 * Credenciales WebAuthn (huella en navegador) por usuario y dispositivo.
 * Solo servidor: NO se sincronizan ni existen en SQLite offline.
 * Varias filas por usuario = varios navegadores/dispositivos.
 */
export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array(),
    nombreDispositivo: text('nombre_dispositivo'),
    creadoEn: timestamp('creado_en', { withTimezone: true })
      .notNull()
      .defaultNow(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    usuarioIdx: index('webauthn_credentials_usuario_idx').on(table.usuarioId)
  })
)

/**
 * Challenges pendientes de ceremonias WebAuthn (registro/login).
 * Necesarios en tabla (no en memoria) porque Vercel es serverless:
 * cada request puede caer en otra instancia. Expiran en minutos y se
 * borran al verificar (más limpieza perezosa en cada emisión).
 */
export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    challenge: text('challenge').notNull(),
    tipo: text('tipo').notNull(),
    expiraEn: timestamp('expira_en', { withTimezone: true }).notNull()
  },
  table => ({
    usuarioIdx: index('webauthn_challenges_usuario_idx').on(table.usuarioId)
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
export type Transferencia = typeof transferencias.$inferSelect
export type NuevaTransferencia = typeof transferencias.$inferInsert
export type TransferenciaItem = typeof transferenciaItems.$inferSelect
export type NuevaTransferenciaItem = typeof transferenciaItems.$inferInsert
export type Ajuste = typeof ajustes.$inferSelect
export type NuevoAjuste = typeof ajustes.$inferInsert
export type Proveedor = typeof proveedores.$inferSelect
export type NuevoProveedor = typeof proveedores.$inferInsert
export type Lote = typeof lotes.$inferSelect
export type NuevoLote = typeof lotes.$inferInsert
export type Traspaso = typeof traspasos.$inferSelect
export type NuevoTraspaso = typeof traspasos.$inferInsert
export type MovimientoInventario = typeof movimientosInventario.$inferSelect
export type NuevoMovimientoInventario = typeof movimientosInventario.$inferInsert
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect
export type NuevoWebauthnCredential = typeof webauthnCredentials.$inferInsert

export type Rol = 'jefe' | 'trabajador' | 'cliente'
export type EstadoCuadre = 'abierto' | 'cerrado'
export type TipoLinea = 'normal' | 'descuento' | 'regalo' | 'deuda' | 'descuento_familiar'
export type EstadoCuentaFiado = 'pendiente' | 'parcial' | 'pagada'
export type FormaPagoFiado = 'efectivo' | 'transferencia'
export type TipoAjuste = 'regalo' | 'descuento'
export type TipoMovimiento = 'entrada' | 'traspaso' | 'venta' | 'merma' | 'devolucion' | 'anulacion'
