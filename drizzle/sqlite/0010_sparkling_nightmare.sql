DROP INDEX `usuarios_puesto_nombre_uk`;--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_nombre_uk` ON `usuarios` (`nombre`);--> statement-breakpoint
ALTER TABLE `clientes` ADD `es_centinela` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `clientes_centinela_idx` ON `clientes` (`puesto_id`,`es_centinela`);