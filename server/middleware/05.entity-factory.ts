/**
 * server/middleware/05.entity-factory.ts
 *
 * Middleware que registra y despacha los endpoints REST CRUD autogenerados
 * por `createEntityHandlers()` (server/utils/entityHandlers.js).
 *
 * Las entities se registran en ALL_ENTITIES (shared/entities). Por cada una se
 * generan los handlers estándar: GET /api/<tabla>, GET /api/<tabla>/:id,
 * POST /api/<tabla>, PATCH /api/<tabla>/:id, PUT /api/<tabla>/:id,
 * DELETE /api/<tabla>/:id, más los customActions declarados en la entity
 * (p.ej. PATCH /api/usuarios/:id/pin).
 *
 * El middleware corre ANTES del routing por archivos: si el path y método
 * matchean una ruta del factory, se responde. Si no matchea, se deja pasar
 * al routing por archivos (que puede tener endpoints custom como
 * `server/api/sync/...`, `server/api/graficas/...`,
 * `server/api/cuentas-fiado/index.post.ts`, etc.).
 *
 * El nombre con prefijo numérico (`05.`) garantiza que corra DESPUÉS del
 * middleware de auth (`server/middleware/auth.ts` → `event.context.auth`).
 */
import type { H3Event } from 'h3'
import { ALL_ENTITIES } from '#shared/entities/index.js'
import { db, schemaByTabla } from '../database/client'
import type { schema } from '../database/client'
import { createEntityHandlers } from '../utils/entityHandlers.js'
import { OVERRIDES_ONLINE_POR_KEY } from '../utils/onlineOverrides.js'

/** Handler h3 simple: (event) => unknown */
type RouteHandler = (event: H3Event) => Promise<unknown> | unknown

/** Entity shape mínimo que necesitamos de la entity de shared/entities. */
interface EntityLike {
  key: string
  tabla: string
  customMutations?: unknown
  customActions?: Record<string, { path?: string | ((id: string) => string), method?: string } | undefined>
}

/** Context de auth que devuelven requireAuth/requireRole del server. */
interface AuthContext {
  usuario: { id: string, nombre: string, rol: 'jefe' | 'trabajador', puestoId: string }
  scope: ('sync')[]
}

/** Overrides shape (subset) — todo tipado sin `any`. */
interface ListFilterCtx {
  query: Record<string, unknown>
  auth: AuthContext
  table: unknown
  schema: unknown
}

interface CustomActionArgs {
  event: H3Event
  id: string | undefined
  body: unknown
  auth: AuthContext
  entity: EntityLike
  db: typeof db
  schema: typeof schema
}

interface OnlineOverride {
  requireRole?: string | string[]
  omit?: string[]
  beforeCreate?: (payload: Record<string, unknown>, auth: AuthContext) => Record<string, unknown> | Promise<Record<string, unknown>>
  beforeUpdate?: (cambios: Record<string, unknown>, auth: AuthContext) => Record<string, unknown> | Promise<Record<string, unknown>>
  serialize?: (row: unknown) => unknown
  listFilter?: (ctx: ListFilterCtx) => unknown
  customActionHandlers?: Record<string, (args: CustomActionArgs) => unknown | Promise<unknown>>
}

let _registry: Record<string, RouteHandler> | null = null

function buildRegistry(): Record<string, RouteHandler> {
  if (_registry) return _registry
  const reg: Record<string, RouteHandler> = {}

  for (const e of ALL_ENTITIES as unknown as EntityLike[]) {
    const overrides = (OVERRIDES_ONLINE_POR_KEY as Record<string, OnlineOverride>)[e.key] || {}
    // Cast: createEntityHandlers está en JS y acepta opts dinámicamente.
    // En runtime los campos se validan; aquí solo necesitamos el shape de los handlers.
    const h = createEntityHandlers(
      e as unknown as Parameters<typeof createEntityHandlers>[0],
      { db, schema: schemaByTabla, ...overrides } as unknown as Parameters<typeof createEntityHandlers>[1]
    ) as unknown as {
      list?: RouteHandler
      get?: RouteHandler
      create?: RouteHandler
      patch?: RouteHandler
      put?: RouteHandler
      remove?: RouteHandler
      customActions?: Record<string, RouteHandler>
    }

    const base = `/api/${e.tabla}`

    if (h.list) reg[`GET ${base}`] = h.list
    if (h.create) reg[`POST ${base}`] = h.create

    if (h.get) reg[`GET ${base}/:id`] = h.get
    if (h.patch) reg[`PATCH ${base}/:id`] = h.patch
    if (h.put) reg[`PUT ${base}/:id`] = h.put
    if (h.remove) reg[`DELETE ${base}/:id`] = h.remove

    // customActions: p.ej. PATCH /api/usuarios/:id/pin
    if (h.customActions && e.customActions) {
      for (const [name, handler] of Object.entries(h.customActions)) {
        const action = e.customActions[name]
        if (!action) continue
        let path: string
        if (typeof action.path === 'function') {
          path = action.path(':id')
        } else if (typeof action.path === 'string') {
          path = action.path
        } else {
          path = `${base}/:id/${name}`
        }
        const method = (action.method || 'POST').toUpperCase()
        const cleanPath = path.replace(/^\/+/, '')
        reg[`${method} /api/${e.tabla}/${cleanPath}`] = handler
      }
    }
  }

  _registry = reg
  return reg
}

/**
 * Matchea un método + path real contra un patrón con :params.
 * Devuelve { params } si matchea, o null.
 */
function matchRoute(method: string, url: string, pattern: string): Record<string, string> | null {
  const parts = pattern.split(' ')
  const patMethod = parts[0]
  const patPath = parts[1]
  if (!patMethod || !patPath) return null
  if (patMethod !== method) return null
  const patSegs = patPath.split('/').filter(Boolean)
  const urlNoQuery = url.split('?')[0] || ''
  const urlSegs = urlNoQuery.split('/').filter(Boolean)
  if (patSegs.length !== urlSegs.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patSegs.length; i++) {
    const p = patSegs[i]
    const u = urlSegs[i]
    if (!p || !u) return null
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(u)
    } else if (p !== u) {
      return null
    }
  }
  return params
}

export default defineEventHandler(async (event: H3Event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/')) return

  // Solo despachamos las rutas que arrancan por /api/<tabla> donde <tabla>
  // está registrada. Así /api/health, /api/auth, /api/sync, /api/graficas
  // caen al routing por archivos.
  const registry = buildRegistry()
  const method = (event.method || event.node?.req?.method || 'GET').toUpperCase()

  for (const pattern of Object.keys(registry)) {
    const handler = registry[pattern]
    if (!handler) continue
    const params = matchRoute(method, path, pattern)
    if (!params) continue
    event.context.params = { ...(event.context.params || {}), ...params }
    return await handler(event)
  }

  // No match: dejar al routing por archivos
})
