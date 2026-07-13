/**
 * server/utils/onlineOverrides.js — Overrides por entity para la factory online.
 *
 * Define las particularidades online-only que no pueden ir en la entity (porque
 * la entity es compartida con el server-offline y con la UI). Cada entrada de
 * OVERRIDES_ONLINE_POR_KEY se pasa como `opts` a createEntityHandlers().
 *
 * Convenciones:
 * - requireRole: 'jefe' o ['jefe', 'trabajador'] (string suelto = un solo rol)
 * - beforeCreate(payload, auth) → modifica el payload antes del INSERT
 *   (e.g. hashear pin, inyectar jefeId, convertir numeric → string)
 * - beforeUpdate(cambios, auth)  → modifica los cambios antes del UPDATE
 * - serialize(row)               → transforma la fila devuelta (e.g. ocultar
 *   pinHash, salario → Number). Se ejecuta DESPUÉS de la serialización por defecto.
 * - listFilter({ query, auth, table }) → devuelve un WHERE de Drizzle (o undefined)
 *   que se aplica con AND sobre el WHERE por defecto (puestoId).
 * - customActionHandlers: { nombre: ({ event, id, body, auth, entity, db, schema }) => any }
 *   → handlers para las customActions de la entity. Aquí se hace el trabajo real
 *   (queries, transacciones, etc.); la factory solo se encarga de auth + params.
 * - omit: endpoints estándar a NO generar
 *   ('list' | 'get' | 'create' | 'patch' | 'put' | 'remove')
 *
 * Si una entity no aparece aquí, se genera con la lógica por defecto: auth por
 * scope 'sync', sin filtro extra, sin transformaciones.
 */
import { eq, and, gte, lte } from 'drizzle-orm'
import { z } from 'zod'
import { hashPin } from './auth.ts'

/* -------------------------------------------------------------------------- */
/* Helpers reutilizables                                                       */
/* -------------------------------------------------------------------------- */

/** Filtro que arma WHERE de Drizzle a partir de un query param si está presente. */
function filterIfPresent(queryValue, column) {
  if (queryValue == null || queryValue === '') return undefined
  return eq(column, String(queryValue))
}

/** date range filter: gte(column, from) + lte(column, to) si están presentes. */
function dateRangeFilter(from, to, column) {
  const conds = []
  if (from) conds.push(gte(column, new Date(String(from))))
  if (to) conds.push(lte(column, new Date(String(to))))
  if (!conds.length) return undefined
  return and(...conds)
}

/* -------------------------------------------------------------------------- */
/* Schemas para customActions                                                  */
/* -------------------------------------------------------------------------- */

const z_resetPin = z.object({
  pin: z.string().min(4).max(6)
})

/* -------------------------------------------------------------------------- */
/* Overrides por entity                                                        */
/* -------------------------------------------------------------------------- */

export const OVERRIDES_ONLINE_POR_KEY = {
  // =======================================================================
  // usuario — requiere jefe, hashear PIN, ocultar pinHash en serialización
  // =======================================================================
  usuario: {
    requireRole: 'jefe',
    beforeCreate: async (payload) => {
      const { pin, ...resto } = payload
      const out = { ...resto }
      if (pin) out.pinHash = await hashPin(pin)
      if (out.salario != null) out.salario = String(out.salario)
      return out
    },
    beforeUpdate: async (cambios) => {
      const out = { ...cambios }
      if (out.pin) {
        out.pinHash = await hashPin(out.pin)
        delete out.pin
      }
      if (out.salario != null) out.salario = String(out.salario)
      return out
    },
    serialize: (row) => {
      if (!row) return row
      const copy = { ...row }
      delete copy.pinHash
      return copy
    },
    customActionHandlers: {
      // PATCH /api/usuarios/:id/pin → { pin }
      resetPin: async ({ id, body, db, schema }) => {
        const parsed = z_resetPin.safeParse(body)
        if (!parsed.success) {
          throw createError({ statusCode: 400, statusMessage: 'PIN inválido.' })
        }
        const pinHash = await hashPin(parsed.data.pin)
        const [row] = await db.update(schema.usuarios)
          .set({ pinHash, actualizadoEn: new Date() })
          .where(eq(schema.usuarios.id, id))
          .returning({ id: schema.usuarios.id, nombre: schema.usuarios.nombre })
        if (!row) {
          throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
        }
        return { success: true, ...row }
      }
    }
  },

  // =======================================================================
  // producto — customMutations.create/update (historial_precios) ya en entity
  // =======================================================================
  producto: {
    requireRole: 'jefe'
  },

  // =======================================================================
  // cliente — requireRole jefe, sin filtros extra (factory filtra por puesto)
  // =======================================================================
  cliente: {
    requireRole: 'jefe'
  },

  // =======================================================================
  // cuadre — inyectar jefeId del auth en POST
  // =======================================================================
  cuadre: {
    requireRole: 'jefe',
    beforeCreate: (payload, auth) => ({
      ...payload,
      jefeId: payload.jefeId ?? auth.usuario.id
    })
  },

  // =======================================================================
  // cuadreItem — filtro por cuadre_id
  // =======================================================================
  cuadreItem: {
    requireRole: 'jefe',
    listFilter: ({ query, table }) => filterIfPresent(query.cuadre_id, table.cuadreId)
  },

  // =======================================================================
  // cuentaFiado — el endpoint con join a clientes y filtros finos está en
  // server/api/cuentas-fiado/index.get.ts (custom). El POST con items está en
  // server/api/cuentas-fiado/index.post.ts (custom con transacción).
  // La factory solo genera GET byId, PATCH, PUT y DELETE.
  // =======================================================================
  cuentaFiado: {
    requireRole: 'jefe',
    omit: ['list', 'create', 'put']
  },

  // =======================================================================
  // cuentaFiadoItem — filtro por cuenta_fiado_id
  // =======================================================================
  cuentaFiadoItem: {
    requireRole: 'jefe',
    listFilter: ({ query, table }) => filterIfPresent(query.cuenta_fiado_id, table.cuentaFiadoId)
  },

  // =======================================================================
  // pagoFiado — el endpoint con join a cuadres y filtro por puestoId
  // está en server/api/pagos-fiado/index.get.ts (custom). El POST con
  // transacción está en server/api/pagos-fiado/index.post.ts (custom).
  // La factory NO genera nada para esta entity; solo listFilter/omit
  // están aquí como referencia.
  // =======================================================================
  pagoFiado: {
    requireRole: 'jefe',
    omit: ['list', 'get', 'create', 'patch', 'put', 'remove']
  },

  // =======================================================================
  // historialPrecio — no se exponen endpoints (ui:false, sync lo maneja)
  // =======================================================================
  historialPrecio: {
    omit: ['list', 'get', 'create', 'patch', 'put', 'remove']
  }
}

// Re-exports para tests
export { filterIfPresent, dateRangeFilter }
