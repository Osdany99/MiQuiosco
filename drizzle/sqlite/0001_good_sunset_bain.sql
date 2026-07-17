DROP TABLE `clientes`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`sincronizado` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_usuarios`("id", "puesto_id", "nombre", "telefono", "notas", "rol", "pin_hash", "activo", "salario", "creado_en", "actualizado_en", "sincronizado") SELECT "id", "puesto_id", "nombre", "telefono", "notas", "rol", "pin_hash", "activo", "salario", "creado_en", "actualizado_en", "sincronizado" FROM `usuarios`;--> statement-breakpoint
DROP TABLE `usuarios`;--> statement-breakpoint
ALTER TABLE `__new_usuarios` RENAME TO `usuarios`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `usuarios_rol_idx` ON `usuarios` (`rol`);