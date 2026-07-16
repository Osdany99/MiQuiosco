/* eslint-disable @typescript-eslint/no-explicit-any */
import { eq, and, getTableColumns, type Table, type Column } from 'drizzle-orm'
import { db, schemaByTabla } from '../database/client'
import { makePgCtx } from './pgContext'

/**
 * server/utils/crud.ts — Funciones CRUD reutilizables para endpoints.
 *
 * Cada función acepta solo los campos de config que realmente necesita.
 */

type SafeParseResult = { success: boolean, data?: any, error?: any }
type SafeParseFn = (data: any) => SafeParseResult

interface AuthUser {
  usuario?: { id?: string, puestoId?: string, [key: string]: any }
  [key: string]: any
}

interface CrudListConfig {
  tabla: string
  puestoScoped?: boolean
}

interface CrudListOpts {
  query?: Record<string, any>
  auth?: AuthUser
  listFilter?: (ctx: { query: Record<string, any>, auth?: AuthUser, table: Table, columns: Record<string, Column> }) => any
  serialize?: (row: any) => any
}

interface CrudGetConfig {
  tabla: string
  label: string
}

interface CrudGetOpts {
  id: string
  serialize?: (row: any) => any
}

interface CrudCreateConfig {
  tabla: string
  schema: { safeParse: SafeParseFn }
  puestoScoped?: boolean
  dbSchema?: { shape: Record<string, { constructor: { name: string } }> }
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
  auth?: AuthUser
  hooks?: {
    beforeUpdate?: (cambios: any, auth?: AuthUser) => Promise<any>
  }
  serialize?: (row: any) => any
}

interface CrudRemoveConfig {
  tabla: string
  label: string
  id: string
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

export async function crudList(config: CrudListConfig, opts: CrudListOpts = {}) {
  const { query: queryOpts, auth, listFilter, serialize } = opts
  const table = getTable(config.tabla)
  const columns = getTableColumns(table)

  let where: any
  if (config.puestoScoped && auth?.usuario?.puestoId) {
    where = eq(columns.puestoId as Column, auth.usuario.puestoId)
  }

  if (listFilter && queryOpts) {
    const extra = await listFilter({ query: queryOpts, auth, table, columns })
    if (extra) where = where ? and(where, extra) : extra
  }

  const rows = await db.select().from(table).where(where)
  return serialize ? rows.map(serialize) : rows
}

export async function crudGet(config: CrudGetConfig, opts: CrudGetOpts) {
  const { id, serialize } = opts
  const table = getTable(config.tabla)
  const columns = getTableColumns(table)
  const [row] = await db.select().from(table).where(eq(columns.id as Column, id)).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: `${config.label} no encontrado.` })
  return serialize ? serialize(row) : row
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

  if (config.puestoScoped && !data.puestoId && auth?.usuario?.puestoId) {
    data.puestoId = auth.usuario.puestoId
  }

  if (hooks.beforeCreate) {
    data = await hooks.beforeCreate(data, auth)
  }

  const values = coerceForPg(config.dbSchema, data)

  if (config.customMutations?.create) {
    const ctx = makePgCtx(db, schemaByTabla)
    const row = await config.customMutations.create(ctx, data, { usuarioActual: { value: auth?.usuario } })
    return serialize ? serialize(row) : row
  }

  const [row] = await db.insert(table).values(values).returning()
  return serialize ? serialize(row) : row
}

export async function crudPatch(config: CrudPatchConfig, opts: CrudPatchOpts) {
  const { id, body, auth, hooks = {}, serialize } = opts
  const table = getTable(config.tabla)
  const columns = getTableColumns(table)

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
    const ctx = makePgCtx(db, schemaByTabla)
    const row = await config.customMutations.update(ctx, id, cambios, { usuarioActual: { value: auth?.usuario } })
    if (!row) throw createError({ statusCode: 404, statusMessage: `${config.label} no encontrado.` })
    return serialize ? serialize(row) : row
  }

  const [row] = await db.update(table).set(setValues).where(eq(columns.id as Column, id)).returning()
  if (!row) throw createError({ statusCode: 404, statusMessage: `${config.label} no encontrado.` })
  return serialize ? serialize(row) : row
}

export async function crudRemove(opts: CrudRemoveConfig) {
  const { tabla, label, id } = opts
  const table = schemaByTabla[tabla]
  if (!table) throw new Error(`Tabla "${tabla}" no encontrada en schema`)
  const columns = getTableColumns(table)
  const [row] = await db.delete(table).where(eq(columns.id as Column, id)).returning({ id: columns.id! })
  if (!row) throw createError({ statusCode: 404, statusMessage: `${label} no encontrado.` })
  return { success: true, id: row.id }
}
