CREATE TYPE "public"."tipo_venta_directa" AS ENUM('directa', 'casa', 'familiar', 'regalo');--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD COLUMN "venta_directa_item_id" uuid;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD COLUMN "cuenta_fiado_item_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas_directas" ADD COLUMN "tipo_venta" "tipo_venta_directa" DEFAULT 'directa' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas_directas" ADD COLUMN "cliente_id" uuid;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_venta_directa_item_id_ventas_directas_items_id_fk" FOREIGN KEY ("venta_directa_item_id") REFERENCES "public"."ventas_directas_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_cuenta_fiado_item_id_cuentas_fiado_items_id_fk" FOREIGN KEY ("cuenta_fiado_item_id") REFERENCES "public"."cuentas_fiado_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_directas" ADD CONSTRAINT "ventas_directas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;