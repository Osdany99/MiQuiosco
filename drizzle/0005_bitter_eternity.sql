ALTER TYPE "public"."rol" ADD VALUE 'cliente';--> statement-breakpoint
ALTER TABLE "clientes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "clientes" CASCADE;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" DROP CONSTRAINT "cuentas_fiado_cliente_id_clientes_id_fk";
--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;