ALTER TABLE "clientes" ADD COLUMN "fusionado_en" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_fusionado_en_clientes_id_fk" FOREIGN KEY ("fusionado_en") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_fusionado_idx" ON "clientes" USING btree ("fusionado_en");