CREATE TABLE `clientes` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`nombre` text NOT NULL,
	`notas` text,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `clientes_puesto_idx` ON `clientes` (`puesto_id`);--> statement-breakpoint
CREATE INDEX `clientes_puesto_nombre_idx` ON `clientes` (`puesto_id`,`nombre`);--> statement-breakpoint
CREATE INDEX `clientes_actualizado_en_idx` ON `clientes` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `clientes_sincronizado_idx` ON `clientes` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `clientes_telefonos` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cliente_id` text NOT NULL,
	`telefono` text NOT NULL,
	`telefono_raw` text,
	`etiqueta` text,
	`activo` integer DEFAULT true NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_telefonos_telefono_unique` ON `clientes_telefonos` (`telefono`);--> statement-breakpoint
CREATE UNIQUE INDEX `clientes_telefonos_telefono_uk` ON `clientes_telefonos` (`telefono`);--> statement-breakpoint
CREATE INDEX `clientes_telefonos_cliente_idx` ON `clientes_telefonos` (`cliente_id`);--> statement-breakpoint
CREATE INDEX `clientes_telefonos_actualizado_en_idx` ON `clientes_telefonos` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `clientes_telefonos_sincronizado_idx` ON `clientes_telefonos` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `cobros_recarga` (
	`id` text PRIMARY KEY NOT NULL,
	`recarga_id` text NOT NULL,
	`monto` real NOT NULL,
	`forma_pago` text NOT NULL,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cobros_recarga_recarga_idx` ON `cobros_recarga` (`recarga_id`);--> statement-breakpoint
CREATE INDEX `cobros_recarga_creado_en_idx` ON `cobros_recarga` (`creado_en`);--> statement-breakpoint
CREATE INDEX `cobros_recarga_sincronizado_idx` ON `cobros_recarga` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `cuadres_recarga` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`fecha` text NOT NULL,
	`estado` text DEFAULT 'abierto' NOT NULL,
	`total_nominal` real DEFAULT 0 NOT NULL,
	`total_costo` real DEFAULT 0 NOT NULL,
	`total_ganancia` real DEFAULT 0 NOT NULL,
	`saldo_cartera_inicial` real,
	`saldo_cartera_final` real,
	`efectivo_real` real,
	`diferencia` real,
	`notas` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cuadres_recarga_puesto_fecha_uk` ON `cuadres_recarga` (`puesto_id`,`fecha`);--> statement-breakpoint
CREATE INDEX `cuadres_recarga_actualizado_en_idx` ON `cuadres_recarga` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `cuadres_recarga_sincronizado_idx` ON `cuadres_recarga` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `recargas` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`cliente_id` text,
	`telefono_destino` text NOT NULL,
	`telefono_raw` text,
	`plataforma` text NOT NULL,
	`tipo` text DEFAULT 'saldo' NOT NULL,
	`descripcion` text,
	`unidades` integer,
	`monto_nominal` real NOT NULL,
	`costo` real NOT NULL,
	`ganancia` real NOT NULL,
	`id_transaccion` text,
	`saldo_cartera_cup` real,
	`saldo_cartera_usd` real,
	`estado_pago` text DEFAULT 'pendiente' NOT NULL,
	`monto_cobrado` real DEFAULT 0 NOT NULL,
	`sms_id` text,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "recargas_plataforma_check" CHECK("recargas"."plataforma" IN ('monedero', 'banco')),
	CONSTRAINT "recargas_tipo_check" CHECK("recargas"."tipo" IN ('saldo', 'voz', 'sms', 'datos')),
	CONSTRAINT "recargas_estado_pago_check" CHECK("recargas"."estado_pago" IN ('pagada', 'pendiente'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `recargas_id_transaccion_unique` ON `recargas` (`id_transaccion`);--> statement-breakpoint
CREATE INDEX `recargas_telefono_fecha_idx` ON `recargas` (`telefono_destino`,`creado_en`);--> statement-breakpoint
CREATE INDEX `recargas_estado_pago_idx` ON `recargas` (`estado_pago`);--> statement-breakpoint
CREATE INDEX `recargas_cliente_idx` ON `recargas` (`cliente_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `recargas_id_transaccion_uk` ON `recargas` (`id_transaccion`);--> statement-breakpoint
CREATE INDEX `recargas_actualizado_en_idx` ON `recargas` (`actualizado_en`);--> statement-breakpoint
CREATE INDEX `recargas_sincronizado_idx` ON `recargas` (`sincronizado`);--> statement-breakpoint
CREATE TABLE `sms_etecsa` (
	`id` text PRIMARY KEY NOT NULL,
	`remitente` text NOT NULL,
	`cuerpo` text NOT NULL,
	`recibido_en` integer NOT NULL,
	`hash` text NOT NULL,
	`telefono_destino` text,
	`telefono_raw` text,
	`plataforma` text,
	`tipo` text,
	`descripcion` text,
	`unidades` integer,
	`monto_nominal` real,
	`costo` real,
	`ganancia` real,
	`id_transaccion` text,
	`saldo_cartera_cup` real,
	`saldo_cartera_usd` real,
	`estado` text DEFAULT 'pendiente' NOT NULL,
	`cliente_id` text,
	`recarga_id` text,
	`creado_en` integer NOT NULL,
	`sincronizado` integer DEFAULT false NOT NULL,
	CONSTRAINT "sms_etecsa_estado_check" CHECK("sms_etecsa"."estado" IN ('pendiente', 'guardada', 'descartada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_etecsa_hash_unique` ON `sms_etecsa` (`hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `sms_etecsa_hash_uk` ON `sms_etecsa` (`hash`);--> statement-breakpoint
CREATE INDEX `sms_etecsa_estado_idx` ON `sms_etecsa` (`estado`);--> statement-breakpoint
CREATE INDEX `sms_etecsa_id_transaccion_idx` ON `sms_etecsa` (`id_transaccion`);--> statement-breakpoint
CREATE INDEX `sms_etecsa_creado_en_idx` ON `sms_etecsa` (`creado_en`);