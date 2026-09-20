CREATE TABLE `ajustes` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cuadre_id` text NOT NULL,
	`cliente_id` text,
	`producto_id` text NOT NULL,
	`tipo` text NOT NULL,
	`cantidad` real NOT NULL,
	`monto` real NOT NULL,
	`nota` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "ajustes_tipo_check" CHECK("ajustes"."tipo" IN ('regalo', 'descuento'))
);
--> statement-breakpoint
CREATE INDEX `ajustes_cuadre_idx` ON `ajustes` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `ajustes_cliente_idx` ON `ajustes` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `ajustes_producto_idx` ON `ajustes` (`producto_id`);--> statement-breakpoint
CREATE INDEX `ajustes_actualizado_en_idx` ON `ajustes` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `ajustes_sincronizado_idx` ON `ajustes` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `cuadre_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cuadre_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`precio_venta_usado` real NOT NULL,
	`cantidad` real DEFAULT 0 NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`tipo_linea` text DEFAULT 'normal' NOT NULL,
	`nota` text,
	`es_extra` integer DEFAULT false NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "cuadre_items_tipo_linea_check" CHECK("cuadre_items"."tipo_linea" IN ('normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar'))
);
--> statement-breakpoint
CREATE INDEX `cuadre_items_cuadre_idx` ON `cuadre_items` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `cuadre_items_producto_idx` ON `cuadre_items` (`producto_id`);--> statement-breakpoint
CREATE TABLE `cuadres` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`fecha` text NOT NULL,
	`jefe_id` text NOT NULL,
	`trabajador_turno_id` text,
	`pago_trabajador` real,
	`total_esperado` real DEFAULT 0 NOT NULL,
	`total_real_caja` real,
	`monto_transferencia` real DEFAULT 0 NOT NULL,
	`monto_fiado` real DEFAULT 0 NOT NULL,
	`monto_cobrado_fiado` real DEFAULT 0 NOT NULL,
	`monto_regalo` real DEFAULT 0 NOT NULL,
	`monto_descuento` real DEFAULT 0 NOT NULL,
	`diferencia` real,
	`estado` text DEFAULT 'abierto' NOT NULL,
	`notas` text,
	`cerrado_en` integer,
	`reabierto_veces` integer DEFAULT 0 NOT NULL,
	`ultima_reapertura_en` integer,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "cuadres_estado_check" CHECK("cuadres"."estado" IN ('abierto', 'cerrado'))
);
--> statement-breakpoint
CREATE INDEX `cuadres_fecha_idx` ON `cuadres` (`fecha`);--> statement-breakpoint
CREATE INDEX `cuadres_estado_idx` ON `cuadres` (`estado`);--> statement-breakpoint
CREATE INDEX `cuadres_sincronizado_idx` ON `cuadres` (`sincronizado`);--> statement-breakpoint
CREATE INDEX `cuadres_jefe_idx` ON `cuadres` (`jefe_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cuadres_puesto_fecha_uk` ON `cuadres` (`puesto_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `cuadres_actualizado_en_idx` ON `cuadres` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `cuentas_fiado` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cliente_id` text NOT NULL,
	`cuadre_origen_id` text NOT NULL,
	`monto_total` real NOT NULL,
	`monto_pagado` real DEFAULT 0 NOT NULL,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "cuentas_fiado_estado_check" CHECK("cuentas_fiado"."estado" IN ('pendiente', 'parcial', 'pagada'))
);
--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cliente_idx` ON `cuentas_fiado` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_estado_idx` ON `cuentas_fiado` (`estado`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cuadre_origen_idx` ON `cuentas_fiado` (`cuadre_origen_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_actualizado_en_idx` ON `cuentas_fiado` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `cuentas_fiado_items` (
	`id` text PRIMARY KEY NOT NULL,
	`cuenta_fiado_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_venta_usado` real NOT NULL,
	`subtotal` real NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cuentas_fiado_items_cuenta_idx` ON `cuentas_fiado_items` (`cuenta_fiado_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_items_producto_idx` ON `cuentas_fiado_items` (`producto_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_items_creado_en_idx` ON `cuentas_fiado_items` (`creado_en`);--> statement-breakpoint
CREATE TABLE `historial_precios` (
	`id` text PRIMARY KEY NOT NULL,
	`producto_id` text NOT NULL,
	`precio_compra` real NOT NULL,
	`precio_venta` real NOT NULL,
	`vigente_desde` integer NOT NULL,
	`vigente_hasta` integer,
	`cambiado_por` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `historial_precios_producto_idx` ON `historial_precios` (`producto_id`);--> statement-breakpoint
CREATE INDEX `historial_precios_vigente_idx` ON `historial_precios` (`producto_id`,`vigente_hasta`);--> statement-breakpoint
CREATE INDEX `historial_precios_creado_en_idx` ON `historial_precios` (`creado_en`);--> statement-breakpoint
CREATE TABLE `pagos_fiado` (
	`id` text PRIMARY KEY NOT NULL,
	`cuenta_fiado_id` text NOT NULL,
	`cuadre_id` text NOT NULL,
	`monto` real NOT NULL,
	`forma_pago` text NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pagos_fiado_cuenta_idx` ON `pagos_fiado` (`cuenta_fiado_id`);--> statement-breakpoint
CREATE INDEX `pagos_fiado_cuadre_idx` ON `pagos_fiado` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `pagos_fiado_creado_en_idx` ON `pagos_fiado` (`creado_en`);--> statement-breakpoint
CREATE TABLE `productos` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`descripcion` text,
	`activo` integer DEFAULT true NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`precio_compra_actual` real DEFAULT 0 NOT NULL,
	`precio_venta_actual` real DEFAULT 0 NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `productos_orden_idx` ON `productos` (`orden`);--> statement-breakpoint
CREATE INDEX `productos_activo_idx` ON `productos` (`activo`);--> statement-breakpoint
CREATE INDEX `productos_actualizado_en_idx` ON `productos` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `productos_cache` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`precio_venta_actual` real NOT NULL,
	`orden` integer DEFAULT 0 NOT NULL,
	`descargado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `puestos` (
	`id` text PRIMARY KEY NOT NULL,
	`nombre` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transferencia_items` (
	`id` text PRIMARY KEY NOT NULL,
	`transferencia_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`cantidad` real NOT NULL,
	`precio_venta_usado` real NOT NULL,
	`subtotal` real NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transferencia_items_transferencia_idx` ON `transferencia_items` (`transferencia_id`);--> statement-breakpoint
CREATE INDEX `transferencia_items_producto_idx` ON `transferencia_items` (`producto_id`);--> statement-breakpoint
CREATE INDEX `transferencia_items_creado_en_idx` ON `transferencia_items` (`creado_en`);--> statement-breakpoint
CREATE TABLE `transferencias` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cliente_id` text NOT NULL,
	`cuadre_id` text NOT NULL,
	`monto_total` real NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transferencias_cliente_idx` ON `transferencias` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `transferencias_cuadre_idx` ON `transferencias` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `transferencias_actualizado_en_idx` ON `transferencias` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `transferencias_sincronizado_idx` ON `transferencias` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`telefono` text,
	`notas` text,
	`rol` text NOT NULL,
	`pin_hash` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`salario` real,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT true NOT NULL,
	CONSTRAINT "usuarios_rol_check" CHECK("usuarios"."rol" IN ('jefe', 'trabajador', 'cliente'))
);
--> statement-breakpoint
CREATE INDEX `usuarios_rol_idx` ON `usuarios` (`rol`);--> statement-breakpoint
CREATE INDEX `usuarios_activo_idx` ON `usuarios` (`activo`);--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_puesto_nombre_uk` ON `usuarios` (`puesto_id`,`nombre`);--> statement-breakpoint
CREATE INDEX `usuarios_actualizado_en_idx` ON `usuarios` (`actualizado_en`);