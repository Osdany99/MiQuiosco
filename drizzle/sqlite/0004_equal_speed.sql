PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_cuentas_fiado` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cliente_id` text NOT NULL,
	`cuadre_origen_id` text,
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
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cliente_idx` ON `cuentas_fiado` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_estado_idx` ON `cuentas_fiado` (`estado`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_cuadre_origen_idx` ON `cuentas_fiado` (`cuadre_origen_id`);--> statement-breakpoint
CREATE INDEX `cuentas_fiado_actualizado_en_idx` ON `cuentas_fiado` (`actualizado_en`);--> statement-breakpoint
CREATE TABLE `__new_pagos_fiado` (
	`id` text PRIMARY KEY NOT NULL,
	`cuenta_fiado_id` text NOT NULL,
	`cuadre_id` text,
	`monto` real NOT NULL,
	`forma_pago` text NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_pagos_fiado`("id", "cuenta_fiado_id", "cuadre_id", "monto", "forma_pago", "creado_en", "sincronizado") SELECT "id", "cuenta_fiado_id", "cuadre_id", "monto", "forma_pago", "creado_en", "sincronizado" FROM `pagos_fiado`;--> statement-breakpoint
DROP TABLE `pagos_fiado`;--> statement-breakpoint
ALTER TABLE `__new_pagos_fiado` RENAME TO `pagos_fiado`;--> statement-breakpoint
CREATE INDEX `pagos_fiado_cuenta_idx` ON `pagos_fiado` (`cuenta_fiado_id`);--> statement-breakpoint
CREATE INDEX `pagos_fiado_cuadre_idx` ON `pagos_fiado` (`cuadre_id`);--> statement-breakpoint
CREATE INDEX `pagos_fiado_creado_en_idx` ON `pagos_fiado` (`creado_en`);