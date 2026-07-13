import { z } from 'zod'
import { ALL_ENTITIES, pagoFiado } from './entities/index.js'

/**
 * shared/schemas.js — Schemas zod para casos especiales que NO son entidades CRUD.
 *
 * Tras el refactor "todo parte de las entities", la validación de las tablas
 * vive en `shared/entities/*` (cada entity expone `.schema` y `.updateSchema`).
 *
 * Este archivo cubre los casos que no encajan en el modelo `createEntity`:
 * - login (no es una tabla)
 * - DTOs con estructuras anidadas (crear cuenta de fiado con sus items)
 * - el payload de sync (agregado de todas las tablas sincronizables)
 *
 * Donde tiene sentido, se derivan de las entities para mantener una única
 * fuente de verdad.
 */

/* -------------------------------------------------------------------------- */
/* Login                                                                       */
/* -------------------------------------------------------------------------- */
export const loginSchema = z.object({
  nombre_usuario: z.string().min(1, 'El nombre de usuario es requerido.'),
  pin: z.string().min(4, 'El PIN debe tener al menos 4 dígitos.').max(6, 'El PIN no puede tener más de 6 dígitos.')
})

/* -------------------------------------------------------------------------- */
/* Pago de fiado — reutiliza la entity pagoFiado                               */
/* -------------------------------------------------------------------------- */
export const createPagoFiadoSchema = pagoFiado.schema

/* -------------------------------------------------------------------------- */
/* Cuenta de fiado — DTO con items anidados + pago inicial                     */
/* -------------------------------------------------------------------------- */
export const createCuentaFiadoSchema = z.object({
  clienteId: z.string().uuid(),
  cuadreOrigenId: z.string().uuid(),
  items: z
    .array(
      z.object({
        productoId: z.string().uuid(),
        cantidad: z.number().min(0),
        precioVentaUsado: z.number().min(0)
      })
    )
    .min(1, 'Debe incluir al menos un producto.'),
  montoPagadoInicial: z.number().min(0).optional().default(0),
  formaPagoInicial: z.enum(['efectivo', 'transferencia']).optional().default('efectivo')
})

/* -------------------------------------------------------------------------- */
/* Push sync — generado dinámicamente desde las entities sincronizables        */
/* -------------------------------------------------------------------------- */
/**
 * Las claves del payload son los NOMBRES DE TABLA (snake_case), tal como los
 * consume server/api/sync/push.post.ts (productos, historial_precios, ...).
 *
 * Iterar ALL_ENTITIES lo hace auto-mantenible: al agregar una entity con
 * sync: true, aparece automáticamente en el payload de sincronización.
 *
 * Los registros se validan como objetos permisivos porque el handler ya
 * castea y re-serializa cada campo (String(...), new Date(...)).
 */
const pushSyncShape = {}
for (const entity of ALL_ENTITIES) {
  if (entity.sync) {
    pushSyncShape[entity.tabla] = z.array(z.record(z.string(), z.any())).default([])
  }
}
export const pushSyncSchema = z.object(pushSyncShape)
