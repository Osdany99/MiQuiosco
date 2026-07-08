ALTER TABLE "cuadre_items" ALTER COLUMN "tipo_linea" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "tipo_linea" SET DEFAULT 'normal'::text;--> statement-breakpoint
DROP TYPE "public"."tipo_linea";--> statement-breakpoint
CREATE TYPE "public"."tipo_linea" AS ENUM('normal', 'descuento');--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "tipo_linea" SET DEFAULT 'normal'::"public"."tipo_linea";--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "tipo_linea" SET DATA TYPE "public"."tipo_linea" USING "tipo_linea"::"public"."tipo_linea";