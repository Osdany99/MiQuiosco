PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cuadres` (
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
	`diferencia` real,
	`estado` text DEFAULT 'abierto' NOT NULL,
	`notas` text,
	`cerrado_en` integer,
	`reabierto_veces` integer DEFAULT 0 NOT NULL,
	`ultima_reapertura_en` integer,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "cuadres_estado_check" CHECK("__new_cuadres"."estado" IN ('abierto', 'cerrado'))
);
--> statement-breakpoint
INSERT INTO `__new_cuadres`("id", "puesto_id", "fecha", "jefe_id", "trabajador_turno_id", "pago_trabajador", "total_esperado", "total_real_caja", "monto_transferencia", "monto_fiado", "monto_cobrado_fiado", "diferencia", "estado", "notas", "cerrado_en", "reabierto_veces", "ultima_reapertura_en", "creado_en", "actualizado_en", "sincronizado") SELECT "id", "puesto_id", "fecha", "jefe_id", "trabajador_turno_id", "pago_trabajador", "total_esperado", "total_real_caja", "monto_transferencia", "monto_fiado", "monto_cobrado_fiado", "diferencia", "estado", "notas", "cerrado_en", "reabierto_veces", "ultima_reapertura_en", "creado_en", "actualizado_en", "sincronizado" FROM `cuadres`;--> statement-breakpoint
DROP TABLE `cuadres`;--> statement-breakpoint
ALTER TABLE `__new_cuadres` RENAME TO `cuadres`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cuadres_fecha_idx` ON `cuadres` (`fecha`);--> statement-breakpoint
CREATE INDEX `cuadres_estado_idx` ON `cuadres` (`estado`);--> statement-breakpoint
CREATE INDEX `cuadres_sincronizado_idx` ON `cuadres` (`sincronizado`);--> statement-breakpoint
CREATE INDEX `cuadres_jefe_idx` ON `cuadres` (`jefe_id`);--> statement-breakpoint
CREATE TABLE `__new_cuentas_fiado` (
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
	CONSTRAINT "cuentas_fiado_estado_check" CHECK("__new_cuentas_fiado"."estado" IN ('pendiente', 'parcial', 'pagada'))
);
--> statement-breakpoint
INSERT INTO `__new_cuentas_fiado`("id", "puesto_id", "cliente_id", "cuadre_origen_id", "monto_total", "monto_pagado", "estado", "creado_en", "actualizado_en", "sincronizado") SELECT "id", "puesto_id", "cliente_id", "cuadre_origen_id", "monto_total", "monto_pagado", "estado", "creado_en", "actualizado_en", "sincronizado" FROM `cuentas_fiado`;--> statement-breakpoint
DROP TABLE `cuentas_fiado`;--> statement-breakpoint
ALTER TABLE `__new_cuentas_fiado` RENAME TO `cuentas_fiado`;--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cliente_idx` ON `cuentas_fiado` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_estado_idx` ON `cuentas_fiado` (`estado`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cuadre_origen_idx` ON `cuentas_fiado` (`cuadre_origen_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_items_producto_idx` ON `cuentas_fiado_items` (`producto_id`);--> statement-breakpoint
CREATE INDEX `historial_precios_vigente_idx` ON `historial_precios` (`producto_id`,`vigente_hasta`);--> statement-breakpoint
CREATE INDEX `productos_activo_idx` ON `productos` (`activo`);--> statement-breakpoint
CREATE TABLE `__new_usuarios` (
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
	CONSTRAINT "usuarios_rol_check" CHECK("__new_usuarios"."rol" IN ('jefe', 'trabajador', 'cliente'))
);
--> statement-breakpoint
INSERT INTO `__new_usuarios`("id", "puesto_id", "nombre", "telefono", "notas", "rol", "pin_hash", "activo", "salario", "creado_en", "actualizado_en", "sincronizado") SELECT "id", "puesto_id", "nombre", "telefono", "notas", "rol", "pin_hash", "activo", "salario", "creado_en", "actualizado_en", "sincronizado" FROM `usuarios`;--> statement-breakpoint
DROP TABLE `usuarios`;--> statement-breakpoint
ALTER TABLE `__new_usuarios` RENAME TO `usuarios`;--> statement-breakpoint
CREATE INDEX `usuarios_rol_idx` ON `usuarios` (`rol`);--> statement-breakpoint
CREATE INDEX `usuarios_activo_idx` ON `usuarios` (`activo`);--> statement-breakpoint
CREATE TABLE `__new_cuadre_items` (
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
	CONSTRAINT "cuadre_items_tipo_linea_check" CHECK("__new_cuadre_items"."tipo_linea" IN ('normal', 'descuento', 'regalo', 'deuda', 'descuento_familiar'))
);
--> statement-breakpoint
INSERT INTO `__new_cuadre_items`("id", "cuadre_id", "producto_id", "precio_venta_usado", "cantidad", "subtotal", "tipo_linea", "nota", "es_extra", "creado_en", "actualizado_en", "sincronizado") SELECT "id", "cuadre_id", "producto_id", "precio_venta_usado", "cantidad", "subtotal", "tipo_linea", "nota", "es_extra", "creado_en", "actualizado_en", "sincronizado" FROM `cuadre_items`;--> statement-breakpoint
DROP TABLE `cuadre_items`;--> statement-breakpoint
ALTER TABLE `__new_cuadre_items` RENAME TO `cuadre_items`;--> statement-breakpoint
CREATE INDEX `cuadre_items_cuadre_idx` ON `cuadre_items` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `cuadre_items_producto_idx` ON `cuadre_items` (`producto_id`);