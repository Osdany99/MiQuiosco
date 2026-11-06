CREATE TABLE `sync_log` (
	`id` text PRIMARY KEY NOT NULL,
	`creado_en` integer NOT NULL,
	`nivel` text DEFAULT 'info' NOT NULL,
	`evento` text NOT NULL,
	`tabla` text,
	`lote_id` text,
	`filas` integer,
	`duracion_ms` integer,
	`http` integer,
	`mensaje` text,
	`datos` text
);
--> statement-breakpoint
CREATE INDEX `sync_log_creado_en_idx` ON `sync_log` (`creado_en`);--> statement-breakpoint
CREATE INDEX `sync_log_nivel_idx` ON `sync_log` (`nivel`);