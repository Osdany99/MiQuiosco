CREATE TYPE "public"."estado_cuadre" AS ENUM('abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('jefe', 'trabajador');--> statement-breakpoint
CREATE TYPE "public"."tipo_linea" AS ENUM('normal', 'regalo', 'descuento_familiar');--> statement-breakpoint
CREATE TABLE "cuadre_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cuadre_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio_venta_usado" numeric(10, 2) NOT NULL,
	"cantidad" numeric(10, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"tipo_linea" "tipo_linea" DEFAULT 'normal' NOT NULL,
	"nota" text,
	"es_extra" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cuadres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"jefe_id" uuid NOT NULL,
	"trabajador_turno_id" uuid,
	"pago_trabajador" numeric(10, 2),
	"total_esperado" numeric(10, 2) NOT NULL,
	"total_real_caja" numeric(10, 2),
	"monto_transferencia" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monto_fiado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"diferencia" numeric(10, 2),
	"estado" "estado_cuadre" DEFAULT 'abierto' NOT NULL,
	"notas" text,
	"cerrado_en" timestamp with time zone,
	"reabierto_veces" integer DEFAULT 0 NOT NULL,
	"ultima_reapertura_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "historial_precios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"producto_id" uuid NOT NULL,
	"precio_compra" numeric(10, 2) NOT NULL,
	"precio_venta" numeric(10, 2) NOT NULL,
	"vigente_desde" timestamp with time zone NOT NULL,
	"vigente_hasta" timestamp with time zone,
	"cambiado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"descripcion" text,
	"activo" boolean DEFAULT true NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL,
	"precio_compra_actual" numeric(10, 2) DEFAULT '0' NOT NULL,
	"precio_venta_actual" numeric(10, 2) DEFAULT '0' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "puestos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"rol" "rol" NOT NULL,
	"pin_hash" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"debe_cambiar_pin" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuadre_items" ADD CONSTRAINT "cuadre_items_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuadre_items" ADD CONSTRAINT "cuadre_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuadres" ADD CONSTRAINT "cuadres_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuadres" ADD CONSTRAINT "cuadres_jefe_id_usuarios_id_fk" FOREIGN KEY ("jefe_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cuadres" ADD CONSTRAINT "cuadres_trabajador_turno_id_usuarios_id_fk" FOREIGN KEY ("trabajador_turno_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historial_precios" ADD CONSTRAINT "historial_precios_cambiado_por_usuarios_id_fk" FOREIGN KEY ("cambiado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cuadre_items_cuadre_idx" ON "cuadre_items" USING btree ("cuadre_id");--> statement-breakpoint
CREATE INDEX "cuadre_items_producto_idx" ON "cuadre_items" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "cuadres_fecha_idx" ON "cuadres" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "cuadres_estado_idx" ON "cuadres" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "cuadres_jefe_idx" ON "cuadres" USING btree ("jefe_id");--> statement-breakpoint
CREATE INDEX "historial_precios_producto_idx" ON "historial_precios" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "historial_precios_vigente_idx" ON "historial_precios" USING btree ("producto_id","vigente_hasta");--> statement-breakpoint
CREATE INDEX "productos_orden_idx" ON "productos" USING btree ("orden");--> statement-breakpoint
CREATE INDEX "productos_activo_idx" ON "productos" USING btree ("activo");--> statement-breakpoint
CREATE INDEX "usuarios_rol_idx" ON "usuarios" USING btree ("rol");--> statement-breakpoint
CREATE INDEX "usuarios_activo_idx" ON "usuarios" USING btree ("activo");
