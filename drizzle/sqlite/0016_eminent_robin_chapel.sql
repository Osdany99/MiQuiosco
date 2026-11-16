CREATE TABLE `acciones_pendientes_voz` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`usuario_nombre` text,
	`ubicacion` text DEFAULT 'quiosco' NOT NULL,
	`tipo` text DEFAULT 'venta' NOT NULL,
	`tipo_venta` text DEFAULT 'directa' NOT NULL,
	`texto` text NOT NULL,
	`stt_confidence` real,
	`origen` text DEFAULT 'app' NOT NULL,
	`origen_id` text,
	`producto_id` text,
	`producto_nombre` text,
	`cantidad` integer DEFAULT 1 NOT NULL,
	`precio_unitario` real DEFAULT 0 NOT NULL,
	`importe` real DEFAULT 0 NOT NULL,
	`cliente_id` text,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`motivo` text,
	`venta_directa_id` text,
	`dictado_en` integer NOT NULL,
	`aplicada_en` integer,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "acciones_pendientes_voz_estado_check" CHECK("acciones_pendientes_voz"."estado" IN ('pendiente', 'aplicada', 'archivada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `acciones_pendientes_voz_origen_uk` ON `acciones_pendientes_voz` (`origen_id`);--> statement-breakpoint
CREATE INDEX `acciones_pendientes_voz_puesto_estado_idx` ON `acciones_pendientes_voz` (`puesto_id`,`estado`,`dictado_en`);--> statement-breakpoint
CREATE INDEX `acciones_pendientes_voz_dictado_idx` ON `acciones_pendientes_voz` (`dictado_en`);