CREATE TABLE "deleted_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tabla" text NOT NULL,
	"registro_id" text NOT NULL,
	"eliminado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deleted_records_tabla_idx" ON "deleted_records" USING btree ("tabla");--> statement-breakpoint
CREATE INDEX "deleted_records_eliminado_en_idx" ON "deleted_records" USING btree ("eliminado_en");