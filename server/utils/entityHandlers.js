/**
 * server/utils/entityHandlers.js — createEntityHandlers(entity, opts)
 *
 * Genera los handlers REST CRUD estándar para una entity: { list, get, create, patch, put, remove }.
 * Cada handler es compatible con h3 (recibe `event` y devuelve un valor o lanza).
 *
 * Lógica genérica aplicada a partir de la entity:
 * - schema zod (entity.schema / entity.updateSchema) para validar body
 * - timestamps: actualizadoEn = now() en PATCH/PUT
 * - puestoScoped: filtra list por puestoId del usuario actual; inyecta puestoId en create
 * - customMutations: si la entity declara create/update custom, se usan con makePgCtx
 * - serialización: numeric → Number, timestamp → ISO, date → 'YYYY-MM-DD' (vía opts.serialize)
 * - omit: la entity puede declarar qué endpoints estándar NO generar
 *   (entity.http = { omit: ['get', 'patch', ...] })
 *   o por override (opts.omit = ['get', ...]).
 *
 * Particularidades online-only se pasan por `opts` (no ensucian la entity, que es compartida
 * con el server-offline):
 * - opts.requireRole: 'jefe' o ['jefe', 'trabajador']    → guardia de rol en create/patch/put/remove
 * - opts.beforeCreate(payload, auth) → transforma antes del INSERT (e.g. hashPin, jefeId)
 * - opts.beforeUpdate(cambios, auth) → transforma antes del UPDATE
 * - opts.serialize(row)              → transforma la fila devuelta
 * - opts.listFilter({ query, auth }, sqlCtx) → devuelve un WHERE de Drizzle (opcional)
 * - opts.customActionHandlers: { nombre: (event, id, body, auth) => any }
 *   → handlers para las customActions de la entity. El path se obtiene de
 *     entity.customActions[nombre].path(id) y se registra como POST/PATCH/DELETE
 *     según el method declarado en entity.customActions[nombre].method (default POST).
 *
 * @param {Object} entity - entity de shared/entities
 * @param {Object} opts
 * @param {Object} opts.db - cliente Drizzle
 * @param {Object} opts.schema - { [tabla]: drizzleTable }
 * @param {Object} [opts.serialize] - (row) => row
 * @param {(string|string[])} [opts.requireRole]
 * @param {Function} [opts.beforeCreate]
 * @param {Function} [opts.beforeUpdate]
 * @param {Function} [opts.listFilter]
 * @param {Object} [opts.customActionHandlers]
 * @param {string[]} [opts.omit] - endpoints estándar a omitir
 * @returns {Object} { list, get, create, patch, put, remove, customActions: { name: handler } }
 */
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { makePgCtx } from './pgContext.js'
import { requireAuth, requireRole as requireRoleFn } from './auth.ts'

/** Normaliza el rol requerido: 'jefe' | ['jefe', 'trabajador'] → array */
function rolesArr(rr) {
  if (!rr) return null
  return Array.isArray(rr) ? rr : [rr]
}

/** Aplica requireRole si está configurado. */
async function guardAuth(event, opts) {
  if (!opts.requireRole) {
    return await requireAuth(event, 'sync')
  }
  return await requireRoleFn(event, ...rolesArr(opts.requireRole))
}

/**
 * Convierte un payload del form a tipos correctos antes del INSERT/UPDATE
 * usando el schema explícito de la entity (entity.dbSchema).
 * Si no hay dbSchema, hace fallback a inferencia de Drizzle (compatibilidad).
 *
 * Coerciones soportadas:
 * - z.ZodString + number → string (numeric PG)
 * - z.ZodNumber + string → number (si viene string numérico)
 * - z.ZodDate + string → Date
 */
function coercePayloadForDrizzle(entity, data) {
  const targetSchema = entity.dbSchema
  if (!targetSchema) {
    // Fallback simple: devolver datos sin cambios (compatibilidad)
    // Para coerción real sin dbSchema, se necesitaría acceso a schema Drizzle
    return data
  }

  const out = { ...data }
  const shape = targetSchema.shape

  for (const [k, v] of Object.entries(out)) {
    const field = shape[k]
    if (!field || v == null) continue

    // ZodString acepta number → string (para numeric PG)
    if (field instanceof z.ZodString && typeof v === 'number') {
      out[k] = String(v)
    }
    // ZodNumber acepta string numérico → number
    if (field instanceof z.ZodNumber && typeof v === 'string' && !isNaN(v)) {
      out[k] = Number(v)
    }
    // ZodDate acepta string ISO → Date
    if (field instanceof z.ZodDate && typeof v === 'string') {
      const d = new Date(v)
      if (!isNaN(d.getTime())) out[k] = d
    }
  }
  return out
}

/** Helper: registrar todas las claves que NO son timestamps automáticos en un payload. */
function withoutTimestamps(data) {
  const out = { ...data }
  delete out.creadoEn
  delete out.actualizadoEn
  return out
}

/**
 * createEntityHandlers(entity, opts) — devuelve mapa de handlers H3.
 */
export function createEntityHandlers(entity, opts) {
  const tabla = entity.tabla
  const { db, schema, omit = [] } = opts
  const serialize = opts.serialize || (r => r)
  const isOmitted = name => omit.includes(name)

  // Tabla física en Drizzle
  const t = schema[tabla]
  if (!t) {
    throw new Error(`createEntityHandlers(${entity.key}): schema["${tabla}"] no existe`)
  }
  const cols = t[Symbol.for('drizzle:Columns')] || {}
  const tId = cols.id
  if (!tId) {
    throw new Error(`createEntityHandlers(${entity.key}): tabla "${tabla}" no tiene columna "id"`)
  }
  const tPuesto = cols.puestoId

  const handlers = {}

  // --- GET list -----------------------------------------------------------
  if (!isOmitted('list')) {
    handlers.list = async (event) => {
      const auth = opts.requireRole
        ? await requireRoleFn(event, ...rolesArr(opts.requireRole))
        : await requireAuth(event, 'sync')

      let where
      if (entity.puestoScoped) {
        const pid = auth.usuario.puestoId
        if (!pid) return []
        where = eq(tPuesto, pid)
      }

      if (opts.listFilter) {
        const extra = await opts.listFilter({ query: getQuery(event), auth, table: t })
        if (extra) where = where ? and(where, extra) : extra
      }

      const rows = await db.select().from(t).where(where)
      return rows.map(r => serialize(r))
    }
  }

  // --- GET byId -----------------------------------------------------------
  if (!isOmitted('get')) {
    handlers.get = async (event) => {
      await guardAuth(event, opts)
      const id = event.context.params?.id
      if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
      }
      const [row] = await db.select().from(t).where(eq(tId, id)).limit(1)
      if (!row) {
        throw createError({ statusCode: 404, statusMessage: `${entity.label} no encontrado.` })
      }
      return serialize(row)
    }
  }

  // --- POST create --------------------------------------------------------
  if (!isOmitted('create')) {
    handlers.create = async (event) => {
      const auth = await guardAuth(event, opts)

      const body = await readBody(event)
      let payload = withoutTimestamps(body)

      if (opts.beforeCreate) {
        payload = await opts.beforeCreate(payload, auth, event)
      }

      const parsed = entity.schema.safeParse(payload)
      if (!parsed.success) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Datos inválidos.',
          data: parsed.error.flatten()
        })
      }

      payload = { ...parsed.data }

      if (entity.puestoScoped && !payload.puestoId) {
        payload.puestoId = auth.usuario.puestoId
      }

      // customMutation
      if (entity.customMutations?.create) {
        const ctx = makePgCtx(db, schema)
        const row = await entity.customMutations.create(ctx, payload, { usuarioActual: { value: auth.usuario } })
        return serialize(row)
      }

      const values = coercePayloadForDrizzle(entity, payload)
      const [row] = await db.insert(t).values(values).returning()
      return serialize(row)
    }
  }

  // --- PATCH partial ------------------------------------------------------
  if (!isOmitted('patch')) {
    handlers.patch = async (event) => {
      const auth = await guardAuth(event, opts)
      const id = event.context.params?.id
      if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
      }

      const body = await readBody(event)
      const parsed = entity.updateSchema.safeParse(body)
      if (!parsed.success) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Datos inválidos.',
          data: parsed.error.flatten()
        })
      }

      let cambios = { ...parsed.data }
      cambios = withoutTimestamps(cambios)
      if (Object.keys(cambios).length === 0) {
        throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
      }
      if (opts.beforeUpdate) {
        cambios = await opts.beforeUpdate(cambios, auth, event)
      }

      if (entity.customMutations?.update) {
        const ctx = makePgCtx(db, schema)
        const row = await entity.customMutations.update(ctx, id, cambios, { usuarioActual: { value: auth.usuario } })
        if (!row) {
          throw createError({ statusCode: 404, statusMessage: `${entity.label} no encontrado.` })
        }
        return serialize(row)
      }

      const setValues = { ...coercePayloadForDrizzle(entity, cambios), actualizadoEn: new Date() }
      const [row] = await db.update(t).set(setValues).where(eq(tId, id)).returning()
      if (!row) {
        throw createError({ statusCode: 404, statusMessage: `${entity.label} no encontrado.` })
      }
      return serialize(row)
    }
  }

  // --- PUT (alias de PATCH en este proyecto) ------------------------------
  if (!isOmitted('put')) {
    handlers.put = handlers.patch
  }

  // --- DELETE -------------------------------------------------------------
  if (!isOmitted('remove')) {
    handlers.remove = async (event) => {
      await guardAuth(event, opts)
      const id = event.context.params?.id
      if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'ID requerido.' })
      }
      const [row] = await db.delete(t).where(eq(tId, id)).returning({ id: tId })
      if (!row) {
        throw createError({ statusCode: 404, statusMessage: `${entity.label} no encontrado.` })
      }
      return { success: true, id: row.id }
    }
  }

  // --- customActions ------------------------------------------------------
  if (entity.customActions && opts.customActionHandlers) {
    handlers.customActions = {}
    for (const name of Object.keys(entity.customActions)) {
      const handler = opts.customActionHandlers[name]
      if (!handler) continue
      handlers.customActions[name] = async (event) => {
        const auth = await guardAuth(event, opts)
        const id = event.context.params?.id
        const body = await readBody(event).catch(() => ({}))
        return await handler({ event, id, body, auth, entity, db, schema })
      }
    }
  }

  return handlers
}
