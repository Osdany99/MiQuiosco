ALTER TYPE "public"."rol" ADD VALUE 'super_admin';--> statement-breakpoint
ALTER TABLE "puestos" ADD COLUMN "central" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "puestos" ADD COLUMN "permisos" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;