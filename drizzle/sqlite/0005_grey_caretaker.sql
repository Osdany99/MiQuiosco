CREATE TABLE `ventas_directas` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`ubicacion_venta` text DEFAULT 'almacen' NOT NULL,
	`monto_total` real NOT NULL,
	`costo_total` real NOT NULL,
	`ganancia` real NOT NULL,
	`notas` text,
	`usuario_id` text NOT NULL,
	`anulado` integer DEFAULT false NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "ventas_directas_ubicacion_check" CHECK("ventas_directas"."ubicacion_venta" IN ('almacen','quiosco'))
);
--> statement-breakpoint
CREATE INDEX `ventas_directas_puesto_fecha_idx` ON `ventas_directas` (`puesto_id`,`creado_en`);--> statement-breakpoint
CREATE INDEX `ventas_directas_creado_en_idx` ON `ventas_directas` (`creado_en`);--> statement-breakpoint
CREATE TABLE `ventas_directas_items` (
	`id` text PRIMARY KEY NOT NULL,
	`venta_directa_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`cantidad` integer NOT NULL,
	`precio_venta_usado` real NOT NULL,
	`subtotal` real NOT NULL,
	`costo_unitario` real NOT NULL,
	`costo_total` real NOT NULL,
	`secuencia` integer DEFAULT 0 NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ventas_directas_items_venta_idx` ON `ventas_directas_items` (`venta_directa_id`);--> statement-breakpoint
CREATE INDEX `ventas_directas_items_producto_idx` ON `ventas_directas_items` (`producto_id`);--> statement-breakpoint
ALTER TABLE `cuentas_fiado` ADD `costo_total` real;--> statement-breakpoint
ALTER TABLE `cuentas_fiado` ADD `ganancia` real;--> statement-breakpoint
ALTER TABLE `movimientos_inventario` ADD `venta_directa_id` text;