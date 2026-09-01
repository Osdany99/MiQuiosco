CREATE UNIQUE INDEX "cuadres_puesto_fecha_uk" ON "cuadres" USING btree ("puesto_id","fecha");--> statement-breakpoint
CREATE INDEX "cuadres_actualizado_en_idx" ON "cuadres" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_actualizado_en_idx" ON "cuentas_fiado" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_items_creado_en_idx" ON "cuentas_fiado_items" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "historial_precios_creado_en_idx" ON "historial_precios" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "pagos_fiado_creado_en_idx" ON "pagos_fiado" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "productos_actualizado_en_idx" ON "productos" USING btree ("actualizado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_puesto_nombre_uk" ON "usuarios" USING btree ("puesto_id","nombre");--> statement-breakpoint
CREATE INDEX "usuarios_actualizado_en_idx" ON "usuarios" USING btree ("actualizado_en");