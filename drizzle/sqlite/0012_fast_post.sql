CREATE TABLE `sync_fallos` (
	`id` text PRIMARY KEY NOT NULL,
	`clave` text NOT NULL,
	`creado_en` integer NOT NULL,
	`ultimo_en` integer NOT NULL,
	`tipo` text NOT NULL,
	`fase` text,
	`tabla` text,
	`registro_id` text,
	`lote_id` text,
	`codigo_http` integer,
	`motivo` text,
	`mensaje` text,
	`fila` text,
	`contexto` text,
	`app_version` text,
	`dispositivo` text,
	`intentos` integer DEFAULT 1 NOT NULL,
	`subido_en` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sync_fallos_clave_uk` ON `sync_fallos` (`clave`);--> statement-breakpoint
CREATE INDEX `sync_fallos_subido_idx` ON `sync_fallos` (`subido_en`);--> statement-breakpoint
CREATE INDEX `sync_fallos_creado_en_idx` ON `sync_fallos` (`creado_en`);