ALTER TABLE `clientes` ADD `fusionado_en` text;--> statement-breakpoint
CREATE INDEX `clientes_fusionado_idx` ON `clientes` (`fusionado_en`);