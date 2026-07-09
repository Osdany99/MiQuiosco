CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`telefono` text,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clientes_puesto_idx` ON `clientes` (`puesto_id`);--> statement-breakpoint
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
	`sincronizado` integer DEFAULT false NOT NULL
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
	`monto_cobrado_fiado` real,
	`diferencia` real,
	`estado` text DEFAULT 'abierto' NOT NULL,
	`notas` text,
	`cerrado_en` integer,
	`reabierto_veces` integer DEFAULT 0 NOT NULL,
	`ultima_reapertura_en` integer,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cuadres_fecha_idx` ON `cuadres` (`fecha`);--> statement-breakpoint
CREATE INDEX `cuadres_estado_idx` ON `cuadres` (`estado`);--> statement-breakpoint
CREATE INDEX `cuadres_sincronizado_idx` ON `cuadres` (`sincronizado`);--> statement-breakpoint
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
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cliente_idx` ON `cuentas_fiado` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_estado_idx` ON `cuentas_fiado` (`estado`);--> statement-breakpoint
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
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`rol` text NOT NULL,
	`pin_hash` text NOT NULL,
	`activo` integer DEFAULT true NOT NULL,
	`salario` real DEFAULT 600 NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usuarios_rol_idx` ON `usuarios` (`rol`);