ALTER TYPE "public"."tipo_linea" ADD VALUE 'regalo';--> statement-breakpoint
ALTER TYPE "public"."tipo_linea" ADD VALUE 'deuda';--> statement-breakpoint
ALTER TYPE "public"."tipo_linea" ADD VALUE 'descuento_familiar';--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "subtotal" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "total_esperado" SET DEFAULT 0;