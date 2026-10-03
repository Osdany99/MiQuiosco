-- IF NOT EXISTS (Postgres 12+): sobre una BD hecha con db:push el rol 'cliente'
-- ya existia y el ADD VALUE sin guard hacia fallar.
ALTER TYPE "public"."rol" ADD VALUE IF NOT EXISTS 'cliente';--> statement-breakpoint
ALTER TABLE "clientes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "clientes" CASCADE;--> statement-breakpoint
-- El DROP TABLE ... CASCADE de arriba ya elimino esta FK (referenciaba la tabla
-- clientes). El DROP explicito solo servia cuando la cadena se aplicaba sobre
-- una BD hecha con db:push; sobre una BD limpia fallaba con
-- "no existe la restriccion ... en la relacion cuentas_fiado", dejando la
-- cadena 0000..0018 imposible de reproducir desde cero. IF EXISTS mantiene el
-- efecto original en ambos casos.
ALTER TABLE "cuentas_fiado" DROP CONSTRAINT IF EXISTS "cuentas_fiado_cliente_id_clientes_id_fk";
--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "telefono" text;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "notas" text;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;