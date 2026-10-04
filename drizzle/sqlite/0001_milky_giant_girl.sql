CREATE TABLE `lotes` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`proveedor_id` text,
	`lugar_compra` text,
	`fecha_entrada` text NOT NULL,
	`cantidad_inicial` integer NOT NULL,
	`precio_unitario` real NOT NULL,
	`detalle_compra` text,
	`entrada_ref` text,
	`anulado` integer DEFAULT false NOT NULL,
	`notas` text,
	`creado_por` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lotes_producto_idx` ON `lotes` (`producto_id`);--> statement-breakpoint
CREATE INDEX `lotes_fifo_idx` ON `lotes` (`producto_id`,`fecha_entrada`,`creado_en`);--> statement-breakpoint
CREATE INDEX `lotes_puesto_idx` ON `lotes` (`puesto_id`);--> statement-breakpoint
CREATE INDEX `lotes_entrada_ref_idx` ON `lotes` (`entrada_ref`);--> statement-breakpoint
CREATE INDEX `lotes_actualizado_en_idx` ON `lotes` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `movimientos_inventario` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`lote_id` text,
	`cuadre_id` text,
	`linea_cuadre_id` text,
	`traspaso_id` text,
	`tipo` text NOT NULL,
	`cantidad` integer NOT NULL,
	`delta_almacen` integer DEFAULT 0 NOT NULL,
	`delta_quiosco` integer DEFAULT 0 NOT NULL,
	`precio_unitario` real NOT NULL,
	`importe` real NOT NULL,
	`motivo` text,
	`nota` text,
	`usuario_id` text,
	`anulado` integer DEFAULT false NOT NULL,
	`anulado_por` text,
	`anulado_en` integer,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "movimientos_tipo_check" CHECK("movimientos_inventario"."tipo" IN ('entrada','traspaso','venta','merma','devolucion','anulacion'))
);
--> statement-breakpoint
CREATE INDEX `mov_producto_quiosco_idx` ON `movimientos_inventario` (`producto_id`,`anulado`);--> statement-breakpoint
CREATE INDEX `mov_producto_almacen_idx` ON `movimientos_inventario` (`producto_id`,`anulado`,`delta_almacen`);--> statement-breakpoint
CREATE INDEX `mov_cuadre_idx` ON `movimientos_inventario` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `mov_lote_idx` ON `movimientos_inventario` (`lote_id`);--> statement-breakpoint
CREATE INDEX `mov_puesto_fecha_idx` ON `movimientos_inventario` (`puesto_id`,`creado_en`);--> statement-breakpoint
CREATE TABLE `proveedores` (
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
CREATE INDEX `proveedores_puesto_idx` ON `proveedores` (`puesto_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `proveedores_puesto_nombre_uk` ON `proveedores` (`puesto_id`,`nombre`);--> statement-breakpoint
CREATE INDEX `proveedores_actualizado_en_idx` ON `proveedores` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `traspasos` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`fecha` text NOT NULL,
	`desde` text DEFAULT 'almacen' NOT NULL,
	`hasta` text DEFAULT 'quiosco' NOT NULL,
	`notas` text,
	`usuario_id` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `traspasos_puesto_idx` ON `traspasos` (`puesto_id`);--> statement-breakpoint
CREATE INDEX `traspasos_fecha_idx` ON `traspasos` (`fecha`);--> statement-breakpoint
CREATE INDEX `traspasos_actualizado_en_idx` ON `traspasos` (`actualizado_en`);--> statement-breakpoint
ALTER TABLE `cuadre_items` ADD `secuencia` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `cuadres` ADD `costo_total` real;--> statement-breakpoint
ALTER TABLE `cuadres` ADD `ganancia` real;--> statement-breakpoint
ALTER TABLE `productos` ADD `stock_minimo_quiosco` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `productos` ADD `stock_recomendado_quiosco` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `productos` ADD `stock_minimo_almacen` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `productos` ADD `unidad` text;