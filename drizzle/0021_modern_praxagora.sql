ALTER TABLE "movimientos_inventario" DROP CONSTRAINT "movimientos_inventario_cuenta_fiado_item_id_cuentas_fiado_items_id_fk";
--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_cuenta_fiado_item_id_cuentas_fiado_items_id_fk" FOREIGN KEY ("cuenta_fiado_item_id") REFERENCES "public"."cuentas_fiado_items"("id") ON DELETE cascade ON UPDATE no action;