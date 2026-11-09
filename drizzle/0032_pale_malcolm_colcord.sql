CREATE TABLE "voz_lexico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"categoria" text NOT NULL,
	"valor" text NOT NULL,
	"clave" text,
	"activo" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"nota" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "voz_lexico_categoria_valor_uk" ON "voz_lexico" USING btree ("categoria","valor");