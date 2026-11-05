ALTER TABLE `movimientos_inventario` ADD `venta_directa_item_id` text;--> statement-breakpoint
ALTER TABLE `movimientos_inventario` ADD `cuenta_fiado_item_id` text;--> statement-breakpoint
ALTER TABLE `ventas_directas` ADD `tipo_venta` text DEFAULT 'directa' NOT NULL;--> statement-breakpoint
ALTER TABLE `ventas_directas` ADD `cliente_id` text;