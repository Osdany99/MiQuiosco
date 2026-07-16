ALTER TABLE "cuadre_items" ALTER COLUMN "precio_venta_usado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "cantidad" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadre_items" ALTER COLUMN "subtotal" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "pago_trabajador" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "total_esperado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "total_real_caja" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "monto_transferencia" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "monto_fiado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "monto_cobrado_fiado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuadres" ALTER COLUMN "diferencia" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ALTER COLUMN "monto_total" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado" ALTER COLUMN "monto_pagado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado_items" ALTER COLUMN "cantidad" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado_items" ALTER COLUMN "precio_venta_usado" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "cuentas_fiado_items" ALTER COLUMN "subtotal" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "historial_precios" ALTER COLUMN "precio_compra" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "historial_precios" ALTER COLUMN "precio_venta" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "pagos_fiado" ALTER COLUMN "monto" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "productos" ALTER COLUMN "precio_compra_actual" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "productos" ALTER COLUMN "precio_venta_actual" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" SET DATA TYPE double precision;--> statement-breakpoint
ALTER TABLE "usuarios" ALTER COLUMN "salario" SET DEFAULT 600;--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "debe_cambiar_pin";