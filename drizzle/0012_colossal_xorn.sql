CREATE TYPE "public"."tipo_movimiento" AS ENUM('entrada', 'traspaso', 'venta', 'merma', 'devolucion', 'anulacion');--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"proveedor_id" uuid,
	"lugar_compra" text,
	"fecha_entrada" date NOT NULL,
	"cantidad_inicial" integer NOT NULL,
	"precio_unitario" double precision NOT NULL,
	"detalle_compra" text,
	"entrada_ref" uuid,
	"anulado" boolean DEFAULT false NOT NULL,
	"notas" text,
	"creado_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"producto_id" uuid NOT NULL,
	"lote_id" uuid,
	"cuadre_id" uuid,
	"linea_cuadre_id" uuid,
	"traspaso_id" uuid,
	"tipo" "tipo_movimiento" NOT NULL,
	"cantidad" integer NOT NULL,
	"delta_almacen" integer DEFAULT 0 NOT NULL,
	"delta_quiosco" integer DEFAULT 0 NOT NULL,
	"precio_unitario" double precision NOT NULL,
	"importe" double precision NOT NULL,
	"motivo" text,
	"nota" text,
	"usuario_id" uuid,
	"anulado" boolean DEFAULT false NOT NULL,
	"anulado_por" uuid,
	"anulado_en" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
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
CREATE TABLE "traspasos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"puesto_id" uuid NOT NULL,
	"fecha" date NOT NULL,
	"desde" text DEFAULT 'almacen' NOT NULL,
	"hasta" text DEFAULT 'quiosco' NOT NULL,
	"notas" text,
	"usuario_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cuadre_items" ADD COLUMN "secuencia" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cuadres" ADD COLUMN "costo_total" double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ADD COLUMN "ganancia" double precision;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "stock_minimo_quiosco" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "stock_recomendado_quiosco" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "stock_minimo_almacen" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "unidad" text;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_lote_id_lotes_id_fk" FOREIGN KEY ("lote_id") REFERENCES "public"."lotes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_cuadre_id_cuadres_id_fk" FOREIGN KEY ("cuadre_id") REFERENCES "public"."cuadres"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_linea_cuadre_id_cuadre_items_id_fk" FOREIGN KEY ("linea_cuadre_id") REFERENCES "public"."cuadre_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_traspaso_id_traspasos_id_fk" FOREIGN KEY ("traspaso_id") REFERENCES "public"."traspasos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_anulado_por_usuarios_id_fk" FOREIGN KEY ("anulado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_puesto_id_puestos_id_fk" FOREIGN KEY ("puesto_id") REFERENCES "public"."puestos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traspasos" ADD CONSTRAINT "traspasos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lotes_producto_idx" ON "lotes" USING btree ("producto_id");--> statement-breakpoint
CREATE INDEX "lotes_fifo_idx" ON "lotes" USING btree ("producto_id","fecha_entrada","creado_en");--> statement-breakpoint
CREATE INDEX "lotes_puesto_idx" ON "lotes" USING btree ("puesto_id");--> statement-breakpoint
CREATE INDEX "lotes_entrada_ref_idx" ON "lotes" USING btree ("entrada_ref");--> statement-breakpoint
CREATE INDEX "lotes_actualizado_en_idx" ON "lotes" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "mov_producto_quiosco_idx" ON "movimientos_inventario" USING btree ("producto_id","anulado");--> statement-breakpoint
CREATE INDEX "mov_producto_almacen_idx" ON "movimientos_inventario" USING btree ("producto_id","anulado","delta_almacen");--> statement-breakpoint
CREATE INDEX "mov_cuadre_idx" ON "movimientos_inventario" USING btree ("cuadre_id");--> statement-breakpoint
CREATE INDEX "mov_lote_idx" ON "movimientos_inventario" USING btree ("lote_id");--> statement-breakpoint
CREATE INDEX "mov_puesto_fecha_idx" ON "movimientos_inventario" USING btree ("puesto_id","creado_en");--> statement-breakpoint
CREATE INDEX "proveedores_puesto_idx" ON "proveedores" USING btree ("puesto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "proveedores_puesto_nombre_uk" ON "proveedores" USING btree ("puesto_id","nombre");--> statement-breakpoint
CREATE INDEX "proveedores_actualizado_en_idx" ON "proveedores" USING btree ("actualizado_en");--> statement-breakpoint
CREATE INDEX "traspasos_puesto_idx" ON "traspasos" USING btree ("puesto_id");--> statement-breakpoint
CREATE INDEX "traspasos_fecha_idx" ON "traspasos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "traspasos_actualizado_en_idx" ON "traspasos" USING btree ("actualizado_en");