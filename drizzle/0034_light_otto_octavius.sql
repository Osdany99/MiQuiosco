CREATE TABLE "voz_confirmaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"producto_id" uuid,
	"producto_nombre" text,
	"cantidad" integer,
	"ubicacion" text,
	"modo" text,
	"confianza" double precision,
	"outcome" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voz_confirmaciones" ADD CONSTRAINT "voz_confirmaciones_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voz_confirmaciones" ADD CONSTRAINT "voz_confirmaciones_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voz_confirmaciones" ADD CONSTRAINT "voz_confirmaciones_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voz_confirmaciones_puesto_creado_en_idx" ON "voz_confirmaciones" USING btree ("puesto_id","creado_en");