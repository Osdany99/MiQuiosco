DROP INDEX "usuarios_puesto_nombre_uk";--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "es_centinela" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "deleted_records" ADD COLUMN "puesto_id" uuid;--> statement-breakpoint
ALTER TABLE "deleted_records" ADD CONSTRAINT "deleted_records_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_centinela_idx" ON "clientes" USING btree ("puesto_id","es_centinela");--> statement-breakpoint
CREATE INDEX "deleted_records_puesto_idx" ON "deleted_records" USING btree ("puesto_id","eliminado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_nombre_uk" ON "usuarios" USING btree ("nombre");