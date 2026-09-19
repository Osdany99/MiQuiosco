CREATE TYPE "public"."tipo_ajuste" AS ENUM('regalo', 'descuento');--> statement-breakpoint
ALTER TYPE "public"."tipo_linea" ADD VALUE 'regalo';--> statement-breakpoint
ALTER TYPE "public"."tipo_linea" ADD VALUE 'deuda';--> statement-breakpoint
ALTER TYPE "public"."tipo_linea" ADD VALUE 'descuento_familiar';--> statement-breakpoint
CREATE TABLE "ajustes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"cuadre_id" uuid NOT NULL,
	"cliente_id" uuid,
	"producto_id" uuid NOT NULL,
	"tipo" "tipo_ajuste" NOT NULL,
	"cantidad" double precision NOT NULL,
	"monto" double precision NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferencia_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transferencia_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" double precision NOT NULL,
	"precio_venta_usado" double precision NOT NULL,
	"subtotal" double precision NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"cuadre_id" uuid NOT NULL,
	"monto_total" double precision NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "subtotal" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "total_esperado" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "cuadres" ADD COLUMN "monto_regalo" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cuadres" ADD COLUMN "monto_descuento" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ajustes" ADD CONSTRAINT "ajustes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_items" ADD CONSTRAINT "transferencia_items_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_items" ADD CONSTRAINT "transferencia_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cliente_id_usuarios_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ajustes_cuadre_idx" ON "ajustes" USING btree ("cuadre_id");--> statement-breakpoint
CREATE INDEX "ajustes_cliente_idx" ON "ajustes" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "ajustes_producto_idx" ON "ajustes" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "ajustes_actualizado_en_idx" ON "ajustes" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "transferencia_items_transferencia_idx" ON "transferencia_items" USING btree ("transferencia_id");--> statement-breakpoint
CREATE INDEX "transferencia_items_producto_idx" ON "transferencia_items" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "transferencia_items_creado_en_idx" ON "transferencia_items" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "transferencias_cliente_idx" ON "transferencias" USING btree ("cliente_id");--> statement-breakpoint
CREATE INDEX "transferencias_cuadre_idx" ON "transferencias" USING btree ("cuadre_id");--> statement-breakpoint
CREATE INDEX "transferencias_actualizado_en_idx" ON "transferencias" USING btree ("actualizado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "cuadres_puesto_fecha_uk" ON "cuadres" USING btree ("puesto_id","fecha");--> statement-breakpoint
CREATE INDEX "cuadres_actualizado_en_idx" ON "cuadres" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_actualizado_en_idx" ON "cuentas_fiado" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "cuentas_fiado_items_creado_en_idx" ON "cuentas_fiado_items" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "historial_precios_creado_en_idx" ON "historial_precios" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "pagos_fiado_creado_en_idx" ON "pagos_fiado" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "productos_actualizado_en_idx" ON "productos" USING btree ("actualizado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_puesto_nombre_uk" ON "usuarios" USING btree ("puesto_id","nombre");--> statement-breakpoint
CREATE INDEX "usuarios_actualizado_en_idx" ON "usuarios" USING btree ("actualizado_en");