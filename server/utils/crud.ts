/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, and, ilike, asc, desc, getTableColumns, type Table, type Column } from 'drizzle-orm'
import { db, schemaByTabla } from '../database/client'
import { makePgCtx } from './pgContext'
import { exigirPuesto } from './puesto'
import type { AuthContext } from './auth'

/**
 * server/utils/crud.ts — Funciones CRUD reutilizables para endpoints.
 *
 * Cada función acepta solo los campos de config que realmente necesita.
 */

type SafeParseResult = { success: boolean, data?: any, error?: any }
type SafeParseFn = (data: any) => SafeParseResult

type AuthUser = AuthContext

interface CrudListConfig {
  tabla: string
  puestoScoped?: boolean
}

interface CrudListOpts {
  query?: Record<string, any>
  // Requerido: sin auth, el filtro puestoScoped queda muerto y el listado
  // devuelve filas de todos los puestos (paso en productos, cuadres,
  // proveedores, traspasos y movimientos). TypeScript lo exige.
  auth: AuthUser
  listFilter?: (ctx: { query: Record<string, any>, auth?: AuthUser, table: Table, columns: Record<string, Column> }) => any
  serialize?: (row: any) => any
}

interface CrudGetConfig {
  tabla: string
  label: string
}

interface CrudGetOpts {
  id: string
  // Requerido: sin auth no se puede verificar el puesto (aislamiento
  // multi-terminal, ver server/utils/puesto.ts). TypeScript lo exige.
  auth: AuthUser
  serialize?: (row: any) => any
}

interface CrudCreateConfig {
  tabla: string
  schema: { safeParse: SafeParseFn }
  puestoScoped?: boolean
  dbSchema?: { shape: Record<string, { constructor: { name: string } }> }
  /**
   * Alta idempotente por el id que manda el cliente. Si llega `id` y la fila
   * ya existe (mismo padre/puesto), se devuelve esa en vez de crear otra.
   * Necesario donde el id nace en el dispositivo: un reintento tras un timeout
   * o un guardado que se repite al cambiar de backend no debe duplicar.
   */
  idempotente?: boolean
  customMutations?: {
    create?: (ctx: any, payload: any, opts: any) => Promise<any>
  }
}

interface CrudCreateOpts {
  body: any
  auth?: AuthUser
  hooks?: {
    beforeCreate?: (payload: any, auth?: AuthUser) => Promise<any>
  }
  serialize?: (row: any) => any
}

interface CrudPatchConfig {
  tabla: string
  label: string
  schema: { safeParse: SafeParseFn, partial: () => { safeParse: SafeParseFn } }
  updateSchema?: { safeParse: SafeParseFn }
  dbSchema?: { shape: Record<string, { constructor: { name: string } }> }
  customMutations?: {
    update?: (ctx: any, id: string, payload: any, opts: any) => Promise<any>
  }
}

interface CrudPatchOpts {
  id: string
  body: any
  // Requerido: sin auth no se puede verificar el puesto (ver CrudGetOpts).
  auth: AuthUser
  hooks?: {
    beforeUpdate?: (cambios: any, auth?: AuthUser) => Promise<any>
  }
  serialize?: (row: any) => any
}

interface CrudRemoveConfig {
  tabla: string
  label: string
  id: string
  // Requerido: sin auth no se puede verificar el puesto (ver CrudGetOpts).
  auth: AuthUser
}

function getTable(tabla: string): Table {
  const table = schemaByTabla[tabla]
  if (!table) throw new Error(`Tabla "${tabla}" no encontrada en schema`)
  return table
}

function coerceForPg(dbSchema: { shape: Record<string, { constructor: { name: string } }> } | undefined, data: Record<string, any>): Record<string, any> {
  if (!dbSchema) return data
  const out = { ...data }
  const shape = dbSchema.shape
  for (const [k, v] of Object.entries(out)) {
    const field = shape[k]
    if (!field || v == null) continue
    if (field.constructor.name === 'ZodString' && typeof v === 'number') out[k] = String(v)
    if (field.constructor.name === 'ZodNumber' && typeof v === 'string' && !isNaN(Number(v))) out[k] = Number(v)
    if (field.constructor.name === 'ZodDate' && typeof v === 'string') {
      const d = new Date(v)
      if (!isNaN(d.getTime())) out[k] = d
    }
  }
  return out
}

function withoutTimestamps(data: Record<string, any>): Record<string, any> {
  const out = { ...data }
  delete out.creadoEn
  delete out.actualizadoEn
  return out
}

function buildFilterFromQuery(query: Record<string, any>, columns: Record<string, Column>) {
  const conditions: any[] = []
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '') continue
    const col = columns[key]
    if (!col) continue
    const ct = (col as any).columnType as string
    if (ct === 'PgText' || ct === 'PgVarchar') {
      conditions.push(ilike(col as any, `%${String(value)}%`))
    } else if (ct === 'PgBoolean') {
      conditions.push(eq(col as any, value === 'true' || value === '1'))
    } else if (ct.startsWith('PgTimestamp') || ct === 'PgDate') {
      conditions.push(eq(col as any, new Date(String(value))))
    } else if (['PgInteger', 'PgSerial', 'PgDoublePrecision', 'PgReal'].includes(ct)) {
      conditions.push(eq(col as any, Number(value)))
    } else {
      conditions.push(eq(col as any, value))
    }
  }
  return conditions.length ? and(...conditions) : undefined
}

export async function crudList(config: CrudListConfig, opts: CrudListOpts) {
  const { query: queryOpts, auth, listFilter, serialize } = opts
  const table = getTable(config.tabla)
  const columns = getTableColumns(table)

  let where: any
  if (config.puestoScoped && auth?.usuario?.puestoId) {
    where = eq(columns.puestoId as Column, auth.usuario.puestoId)
  }

  if (queryOpts) {
    const genericFilter = buildFilterFromQuery(queryOpts, columns)
    if (genericFilter) where = where ? and(where, genericFilter) : genericFilter
  }

  if (listFilter) {
    const extra = await listFilter({ query: queryOpts ?? {}, auth, table, columns })
    if (extra) where = where ? and(where, extra) : extra
  }

  const queryBuilder = db.select().from(table).where(where)

  if (queryOpts?.orderBy && columns[queryOpts.orderBy]) {
    const orderCol = columns[queryOpts.orderBy] as Column
    const rows = await queryBuilder.orderBy(
      queryOpts.orderDir === 'desc' ? desc(orderCol) : asc(orderCol)
    )
    return serialize ? rows.map(serialize) : rows
  }

  const rows = await queryBuilder
  return serialize ? rows.map(serialize) : rows
}

export async function crudGet(config: CrudGetConfig, opts: CrudGetOpts) {
  const { id, auth, serialize } = opts
  // Lanza 404 si no existe O si es de otro puesto (misma respuesta).
  const row = await exigirPuesto(auth, config.tabla, id, config.label)
  return serialize ? serialize(row) : row
}

/**
 * Fila que ya ocupa el id que manda el cliente, si es del mismo puesto.
 *
 * Reutiliza `exigirPuesto` para no duplicar la regla de aislamiento: un id de
 * otro puesto responde 404 igual que si no existiera. Además se compara el
 * padre del payload (cuadreId) para no devolver una fila de otro cuadre del
 * mismo puesto ante una colisión de id.
 */
async function buscarAltaIdempotente(tabla: string, data: Record<string, any>, auth: AuthUser) {
  try {
    const previa = await exigirPuesto(auth, tabla, data.id, 'Registro')
    if (data.cuadreId && previa?.cuadreId && previa.cuadreId !== data.cuadreId) {
      throw createError({ statusCode: 409, statusMessage: 'El id ya existe en otro cuadre.' })
    }
    return previa
  } catch (e: any) {
    if (e?.statusCode === 404) return null
    throw e
  }
}

export async function crudCreate(config: CrudCreateConfig, opts: CrudCreateOpts) {
  const { body, auth, hooks = {}, serialize } = opts
  const table = getTable(config.tabla)

  const payload = withoutTimestamps(body)

  const parsed = config.schema.safeParse(payload)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  let data = { ...parsed.data }

  // Alta idempotente: si el id que manda el cliente ya existe en su puesto, es
  // un reintento (timeout, guardado repetido al cambiar de backend) y devolver
  // la fila guardada evita duplicarla. Va antes de los hooks para que un
  // reintento no dispare sus guardas (p. ej. el 409 de "ya hay cuadre hoy").
  if (config.idempotente && data.id && auth) {
    const previa = await buscarAltaIdempotente(config.tabla, data, auth)
    if (previa) return serialize ? serialize(previa) : previa
  }

  if (config.puestoScoped && !data.puestoId && auth?.usuario?.puestoId) {
    data.puestoId = auth.usuario.puestoId
  }

  if (hooks.beforeCreate) {
    data = await hooks.beforeCreate(data, auth)
  }

  const values = coerceForPg(config.dbSchema, data)

  if (config.customMutations?.create) {
    const mutation = config.customMutations.create
    try {
      // Mutación de varias tablas (productos → historial_precios): sin
      // transacción, un fallo al escribir el historial deja el producto
      // guardado y el usuario ve un precio cambiado del que no hay registro.
      const row = await db.transaction(async (tx) => {
        const ctx = makePgCtx(tx, schemaByTabla)
        return mutation(ctx, data, { usuarioActual: { value: auth?.usuario } })
      })
      return serialize ? serialize(row) : row
    } catch (e: any) {
      if (e?.code === '23505' || e?.cause?.code === '23505') {
        throw createError({ statusCode: 409, statusMessage: 'Ya existe un registro con esos datos únicos.' })
      }
      throw e
    }
  }

  try {
    const [row] = await db.insert(table).values(values).returning()
    return serialize ? serialize(row) : row
  } catch (e: any) {
    if (e?.code === '23505' || e?.cause?.code === '23505') {
      const msg = config.tabla === 'cuadres'
        ? 'Ya existe un cuadre para este puesto en esa fecha.'
        : config.tabla === 'usuarios'
          ? 'Ya existe un usuario con ese nombre en este puesto.'
          : 'Ya existe un registro con esos datos únicos.'
      throw createError({ statusCode: 409, statusMessage: msg })
    }
    throw e
  }
}

export async function crudPatch(config: CrudPatchConfig, opts: CrudPatchOpts) {
  const { id, body, auth, hooks = {}, serialize } = opts
  const table = getTable(config.tabla)
  const columns = getTableColumns(table)

  // Primero el puesto: un 404 temprano evita validar y tocar filas ajenas.
  await exigirPuesto(auth, config.tabla, id, config.label)

  const updateSchema = config.updateSchema || config.schema.partial()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Datos inválidos.', data: parsed.error.flatten() })
  }

  let cambios = { ...parsed.data }
  cambios = withoutTimestamps(cambios)
  if (Object.keys(cambios).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Nada que actualizar.' })
  }

  if (hooks.beforeUpdate) {
    cambios = await hooks.beforeUpdate(cambios, auth)
  }

  const setValues = { ...coerceForPg(config.dbSchema, cambios), actualizadoEn: new Date() }

  if (config.customMutations?.update) {
    const mutation = config.customMutations.update
    const row = await db.transaction(async (tx) => {
      const ctx = makePgCtx(tx, schemaByTabla)
      return mutation(ctx, id, cambios, { usuarioActual: { value: auth?.usuario } })
    })
    if (!row) throw createError({ statusCode: 404, statusMessage: `${config.label} no encontrado.` })
    return serialize ? serialize(row) : row
  }

  const [row] = await db.update(table).set(setValues).where(eq(columns.id as Column, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: `${config.label} no encontrado.` })
  return serialize ? serialize(row) : row
}

export async function crudRemove(opts: CrudRemoveConfig) {
  const { tabla, label, id, auth } = opts
  const table = schemaByTabla[tabla]
  if (!table) throw new Error(`Tabla "${tabla}" no encontrada en schema`)
  const columns = getTableColumns(table)
  // Primero el puesto: no se borra lo ajeno (lanza 404 si no existe o es ajeno).
  await exigirPuesto(auth, tabla, id, label)
  try {
    const [row] = await db.delete(table).where(eq(columns.id as Column, id)).returning({ id: columns.id! })
    if (!row) throw createError({ statusCode: 404, statusMessage: `${label} no encontrado.` })
    return { success: true, id: row.id }
  } catch (e: any) {
    // 23503 = foreign_key_violation. Pasa cuando otras filas apuntan a este
    // registro (por ejemplo, un jefe que tiene cuadres, lotes o traspasos).
    // Sin esto la API respondia 500 "Server Error" y el cliente lo leia como
    // un fallo generico, sin saber que el problema es que hay datos que lo
    // sujetan. 409 + mensaje accionable: se desactiva en vez de borrar.
    if (e?.code === '23503' || e?.cause?.code === '23503') {
      throw createError({
        statusCode: 409,
        statusMessage: `No se puede eliminar ${label.toLowerCase()}: tiene datos asociados que lo necesitan. Desactívalo en lugar de eliminarlo.`
      })
    }
    throw e
  }
}
