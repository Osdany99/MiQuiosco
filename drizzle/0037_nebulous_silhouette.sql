CREATE TABLE "voz_aciertos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"puesto_id" uuid NOT NULL,
	"dispositivo_id" uuid,
	"comando" text NOT NULL,
	"resultado" text NOT NULL,
	"detalle" text,
	"texto" text,
	"confianza" double precision,
	"app_version" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voz_aciertos" ADD CONSTRAINT "voz_aciertos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voz_aciertos" ADD CONSTRAINT "voz_aciertos_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voz_aciertos_puesto_creado_en_idx" ON "voz_aciertos" USING btree ("puesto_id","creado_en");--> statement-breakpoint
CREATE INDEX "voz_aciertos_comando_creado_en_idx" ON "voz_aciertos" USING btree ("comando","creado_en");