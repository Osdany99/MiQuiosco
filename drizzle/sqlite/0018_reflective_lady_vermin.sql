CREATE TABLE `voz_alias` (
	`id` text PRIMARY KEY NOT NULL,
	`puesto_id` text NOT NULL,
	`producto_id` text NOT NULL,
	`texto` text NOT NULL,
	`origen` text DEFAULT 'candidato' NOT NULL,
	`aciertos` integer DEFAULT 0 NOT NULL,
	`creado_en` integer NOT NULL,
	`actualizado_en` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voz_alias_puesto_texto_uk` ON `voz_alias` (`puesto_id`,`texto`);--> statement-breakpoint
CREATE INDEX `voz_alias_producto_idx` ON `voz_alias` (`producto_id`);