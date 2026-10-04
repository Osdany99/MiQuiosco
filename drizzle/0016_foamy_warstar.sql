CREATE TYPE "public"."ubicacion_directa" AS ENUM('almacen', 'quiosco');--> statement-breakpoint
CREATE TABLE "ventas_directas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"ubicacion_venta" "ubicacion_directa" DEFAULT 'almacen' NOT NULL,
	"monto_total" double precision NOT NULL,
	"costo_total" double precision NOT NULL,
	"ganancia" double precision NOT NULL,
	"notas" text,
	"usuario_id" uuid NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas_directas_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venta_directa_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_venta_usado" double precision NOT NULL,
	"subtotal" double precision NOT NULL,
	"costo_unitario" double precision NOT NULL,
	"costo_total" double precision NOT NULL,
	"secuencia" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD COLUMN "costo_total" double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ADD COLUMN "ganancia" double precision;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD COLUMN "venta_directa_id" uuid;--> statement-breakpoint
ALTER TABLE "ventas_directas" ADD CONSTRAINT "ventas_directas_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_directas" ADD CONSTRAINT "ventas_directas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_directas_items" ADD CONSTRAINT "ventas_directas_items_venta_directa_id_ventas_directas_id_fk" FOREIGN KEY ("venta_directa_id") REFERENCES "public"."ventas_directas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_directas_items" ADD CONSTRAINT "ventas_directas_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ventas_directas_puesto_fecha_idx" ON "ventas_directas" USING btree ("puesto_id","creado_en");--> statement-breakpoint
CREATE INDEX "ventas_directas_creado_en_idx" ON "ventas_directas" USING btree ("creado_en");--> statement-breakpoint
CREATE INDEX "ventas_directas_items_venta_idx" ON "ventas_directas_items" USING btree ("venta_directa_id");--> statement-breakpoint
CREATE INDEX "ventas_directas_items_producto_idx" ON "ventas_directas_items" USING btree ("producto_id");--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_venta_directa_id_ventas_directas_id_fk" FOREIGN KEY ("venta_directa_id") REFERENCES "public"."ventas_directas"("id") ON DELETE no action ON UPDATE no action;