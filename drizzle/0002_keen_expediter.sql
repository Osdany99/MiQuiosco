CREATE TYPE "public"."estado_cuenta_fiado" AS ENUM('pendiente', 'parcial', 'pagada');--> statement-breakpoint
CREATE TYPE "public"."forma_pago_fiado" AS ENUM('efectivo', 'transferencia');--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"telefono" text,
	"notas" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas_fiado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cuadre_origen_id" uuid NOT NULL,
	"monto_total" numeric(10, 2) NOT NULL,
	"monto_pagado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estado" "estado_cuenta_fiado" DEFAULT 'pendiente' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuentas_fiado_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_fiado_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" numeric(10, 2) NOT NULL,
	"precio_venta_usado" numeric(10, 2) NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pagos_fiado" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuenta_fiado_id" uuid NOT NULL,
	"cuadre_id" uuid NOT NULL,
	"monto" numeric(10, 2) NOT NULL,
	"forma_pago" "forma_pago_fiado" NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuadres" ADD COLUMN "monto_cobrado_fiado" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD CONSTRAINT "cuentas_fiado_cuadre_origen_id_cuadres_id_fk" FOREIGN KEY ("cuadre_origen_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado_items" ADD CONSTRAINT "cuentas_fiado_items_cuenta_fiado_id_cuentas_fiado_id_fk" FOREIGN KEY ("cuenta_fiado_id") REFERENCES "public"."cuentas_fiado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuentas_fiado_items" ADD CONSTRAINT "cuentas_fiado_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_fiado" ADD CONSTRAINT "pagos_fiado_cuenta_fiado_id_cuentas_fiado_id_fk" FOREIGN KEY ("cuenta_fiado_id") REFERENCES "public"."cuentas_fiado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagos_fiado" ADD CONSTRAINT "pagos_fiado_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_puesto_idx" ON "clientes" USING btree ("puesto_id");--> statement-breakpoint
CREATE INDEX "clientes_activo_idx" ON "clientes" USING btree ("activo");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_cliente_idx" ON "cuentas_fiado" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_estado_idx" ON "cuentas_fiado" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_cuadre_origen_idx" ON "cuentas_fiado" USING btree ("cuadre_origen_id");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_items_cuenta_idx" ON "cuentas_fiado_items" USING btree ("cuenta_fiado_id");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_items_producto_idx" ON "cuentas_fiado_items" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "pagos_fiado_cuenta_idx" ON "pagos_fiado" USING btree ("cuenta_fiado_id");--> statement-breakpoint
CREATE INDEX "pagos_fiado_cuadre_idx" ON "pagos_fiado" USING btree ("cuadre_id");