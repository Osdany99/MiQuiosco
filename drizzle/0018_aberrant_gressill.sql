CREATE TYPE "public"."estado_pago_recarga" AS ENUM('pagada', 'pendiente');--> statement-breakpoint
CREATE TYPE "public"."estado_sms_etecsa" AS ENUM('pendiente', 'guardada', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."plataforma_recarga" AS ENUM('monedero', 'banco');--> statement-breakpoint
CREATE TYPE "public"."tipo_recarga" AS ENUM('saldo', 'voz', 'sms', 'datos');--> statement-breakpoint
-- 0005 borro la tabla clientes y la 0012/0014 la trajeron de vuelta con otras
-- columnas, pero sobre una BD hecha con db:push la tabla ya existia con el
-- schema final y este CREATE TABLE fallaba con "la relacion ya existe".
-- DROP ... IF EXISTS + CASCADE la deja siempre en el estado que la 0018 quiere.
DROP TABLE IF EXISTS "clientes" CASCADE;--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes_telefonos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"telefono" text NOT NULL,
	"telefono_raw" text,
	"etiqueta" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_telefonos_telefono_unique" UNIQUE("telefono")
);
--> statement-breakpoint
CREATE TABLE "cobros_recarga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recarga_id" uuid NOT NULL,
	"monto" double precision NOT NULL,
	"forma_pago" "forma_pago_fiado" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuadres_recarga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"estado" "estado_cuadre" DEFAULT 'abierto' NOT NULL,
	"total_nominal" double precision DEFAULT 0 NOT NULL,
	"total_costo" double precision DEFAULT 0 NOT NULL,
	"total_ganancia" double precision DEFAULT 0 NOT NULL,
	"saldo_cartera_inicial" double precision,
	"saldo_cartera_final" double precision,
	"efectivo_real" double precision,
	"diferencia" double precision,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recargas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"cliente_id" uuid,
	"telefono_destino" text NOT NULL,
	"telefono_raw" text,
	"plataforma" "plataforma_recarga" NOT NULL,
	"tipo" "tipo_recarga" DEFAULT 'saldo' NOT NULL,
	"descripcion" text,
	"unidades" integer,
	"monto_nominal" double precision NOT NULL,
	"costo" double precision NOT NULL,
	"ganancia" double precision NOT NULL,
	"id_transaccion" text,
	"saldo_cartera_cup" double precision,
	"saldo_cartera_usd" double precision,
	"estado_pago" "estado_pago_recarga" DEFAULT 'pendiente' NOT NULL,
	"monto_cobrado" double precision DEFAULT 0 NOT NULL,
	"sms_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recargas_id_transaccion_unique" UNIQUE("id_transaccion")
);
--> statement-breakpoint
CREATE TABLE "sms_etecsa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"remitente" text NOT NULL,
	"cuerpo" text NOT NULL,
	"recibido_en" timestamp with time zone NOT NULL,
	"hash" text NOT NULL,
	"telefono_destino" text,
	"telefono_raw" text,
	"plataforma" "plataforma_recarga",
	"tipo" "tipo_recarga",
	"descripcion" text,
	"unidades" integer,
	"monto_nominal" double precision,
	"costo" double precision,
	"ganancia" double precision,
	"id_transaccion" text,
	"saldo_cartera_cup" double precision,
	"saldo_cartera_usd" double precision,
	"estado" "estado_sms_etecsa" DEFAULT 'pendiente' NOT NULL,
	"cliente_id" uuid,
	"recarga_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_etecsa_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "ajustes" DROP CONSTRAINT "ajustes_cliente_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "cuentas_fiado" DROP CONSTRAINT "cuentas_fiado_cliente_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "transferencias" DROP CONSTRAINT "transferencias_cliente_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_telefonos" ADD CONSTRAINT "clientes_telefonos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes_telefonos" ADD CONSTRAINT "clientes_telefonos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobros_recarga" ADD CONSTRAINT "cobros_recarga_recarga_id_recargas_id_fk" FOREIGN KEY ("recarga_id") REFERENCES "public"."recargas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuadres_recarga" ADD CONSTRAINT "cuadres_recarga_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recargas" ADD CONSTRAINT "recargas_sms_id_sms_etecsa_id_fk" FOREIGN KEY ("sms_id") REFERENCES "public"."sms_etecsa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_etecsa" ADD CONSTRAINT "sms_etecsa_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_puesto_idx" ON "clientes" USING btree ("puesto_id");--> statement-breakpoint
CREATE INDEX "clientes_puesto_nombre_idx" ON "clientes" USING btree ("puesto_id","nombre");--> statement-breakpoint
CREATE INDEX "clientes_activo_idx" ON "clientes" USING btree ("activo");--> statement-breakpoint
CREATE INDEX "clientes_actualizado_en_idx" ON "clientes" USING btree ("actualizado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_telefonos_telefono_uk" ON "clientes_telefonos" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX "clientes_telefonos_cliente_idx" ON "clientes_telefonos" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "clientes_telefonos_actualizado_en_idx" ON "clientes_telefonos" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cobros_recarga_recarga_idx" ON "cobros_recarga" USING btree ("recarga_id");--> statement-breakpoint
CREATE INDEX "cobros_recarga_creado_en_idx" ON "cobros_recarga" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "cuadres_recarga_puesto_fecha_uk" ON "cuadres_recarga" USING btree ("puesto_id","fecha");--> statement-breakpoint
CREATE INDEX "cuadres_recarga_actualizado_en_idx" ON "cuadres_recarga" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "recargas_telefono_fecha_idx" ON "recargas" USING btree ("telefono_destino","creado_en");--> statement-breakpoint
CREATE INDEX "recargas_estado_pago_idx" ON "recargas" USING btree ("estado_pago");--> statement-breakpoint
CREATE INDEX "recargas_cliente_idx" ON "recargas" USING btree ("cliente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recargas_id_transaccion_uk" ON "recargas" USING btree ("id_transaccion");--> statement-breakpoint
CREATE INDEX "recargas_actualizado_en_idx" ON "recargas" USING btree ("actualizado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_etecsa_hash_uk" ON "sms_etecsa" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "sms_etecsa_estado_idx" ON "sms_etecsa" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "sms_etecsa_id_transaccion_idx" ON "sms_etecsa" USING btree ("id_transaccion");--> statement-breakpoint
CREATE INDEX "sms_etecsa_creado_en_idx" ON "sms_etecsa" USING btree ("creado_en");--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;