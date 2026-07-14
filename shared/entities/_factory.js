import { buildZodSchema } from './_zod.js'

/**
 * shared/entities/_factory.js — createEntity() — única fuente de verdad.
 *
 * Una entity es un objeto JS plano que describe TODO sobre una tabla:
 * - schema zod (create + update) — explícitos o generados desde fields
 * - dbSchema / sqliteSchema — opcionales, para coerción a tipos de BD
 * - endpoints REST del servidor online
 * - fields del form (de BaseForm)
 * - columns de la tabla (de BaseTable)
 * - flags: sync, puestoScoped, ui
 * - customMutations: lógica custom para create/update (offline + online)
 * - customActions: endpoints REST adicionales
 *
 * Una entity se consume desde:
 * - server/api/<tabla>/*.ts  (validación + serialización)
 * - server-offline/api/*     (CRUD genérico + customMutations)
 * - app/composables/useRepo  (CRUD agnóstico de backend)
 * - app/composables/useTableData + useTableCrud (tabla CRUD)
 * - app/composables/useEntityForm (form auto-derivado — Fase 2)
 * - app/composables/useEntityTable (tabla auto-derivada — Fase 3)
 *
 * Ejemplo:
 *   export const producto = createEntity({
 *     key: 'producto', tabla: 'productos', label: 'Producto',
 *     fields: { nombre: { type: 'string', required: true, max: 100 } },
 *     schema: z.object({ nombre: z.string().max(100) }),
 *     updateSchema: z.object({ nombre: z.string().max(100) }).partial(),
 *     columns: [ { accessorKey: 'nombre', header: 'Producto' } ],
 *     puestoScoped: true, sync: true
 *   })
 *
 * @param {Object} def
 * @param {string} def.key - Identificador JS (singular, camelCase): 'producto'
 * @param {string} def.tabla - Nombre de tabla (snake_case, plural): 'productos'
 * @param {string} def.label - Etiqueta singular para UI: 'Producto'
 * @param {string} [def.pluralLabel] - Etiqueta plural: 'Productos'
 * @param {Object} def.fields - { nombreField: { type, required?, min?, max?, default?, values? } }
 * @param {z.ZodObject} [def.schema] - Schema Zod explícito para CREATE (validación entrada)
 * @param {z.ZodObject} [def.updateSchema] - Schema Zod explícito para UPDATE (validación entrada)
 * @param {z.ZodObject} [def.dbSchema] - Schema Zod para coerción a PostgreSQL (numeric→string, etc.)
 * @param {z.ZodObject} [def.sqliteSchema] - Schema Zod para coerción a SQLite
 * @param {Array}  [def.columns] - Configuración de columnas para BaseTable
 * @param {boolean}[def.puestoScoped] - Si filtra por puestoId del usuario actual
 * @param {boolean}[def.sync] - Si se sincroniza (true por defecto)
 * @param {boolean}[def.ui] - Si tiene UI (false para entities internas como historial)
 * @param {Object} [def.customMutations] - { create?, update? } funciones (ctx, data, auth) => row
 * @param {Object} [def.customActions] - { nombreAction: { path: '/api/...' } }
 * @returns {Object} entity
 */
export function createEntity(def) {
  if (!def.key) throw new Error('createEntity: def.key es requerido')
  if (!def.tabla) throw new Error(`createEntity(${def.key}): def.tabla es requerido`)
  if (!def.label) throw new Error(`createEntity(${def.key}): def.label es requerido`)
  if (!def.fields || typeof def.fields !== 'object') {
    throw new Error(`createEntity(${def.key}): def.fields es requerido`)
  }

  // Schemas de validación: explícitos o generados desde fields
  const schema = def.schema || buildZodSchema(def.fields)
  const updateSchema = def.updateSchema || schema.partial()

  return {
    key: def.key,
    tabla: def.tabla,
    label: def.label,
    pluralLabel: def.pluralLabel || `${def.label}s`,
    fields: def.fields,
    columns: def.columns || [],
    schema,
    updateSchema,
    dbSchema: def.dbSchema || null,
    sqliteSchema: def.sqliteSchema || null,
    endpoints: buildEndpoints(def),
    sync: def.sync !== false,
    puestoScoped: !!def.puestoScoped,
    ui: def.ui !== false,
    customMutations: def.customMutations || null,
    customActions: def.customActions || {}
  }
}

/**
 * Construye el mapa de endpoints REST estándar de una entity.
 * Convención: /api/<tabla> y /api/<tabla>/:id
 *
 * Las customActions extienden este mapa con paths adicionales:
 *   { resetPin: { path: id => `/api/${tabla}/${id}/pin` } }
 * se traduce a:
 *   { resetPin: '/api/usuarios/123/pin' (vía llamada con id) }
 *
 * @param {Object} def
 * @returns {Object} { list, byId, ...customActions resueltas }
 */
function buildEndpoints(def) {
  const base = `/api/${def.tabla}`
  const endpoints = {
    list: base,
    byId: id => `${base}/${id}`
  }

  for (const [name, action] of Object.entries(def.customActions || {})) {
    endpoints[name] = typeof action.path === 'function'
      ? action.path
      : typeof action.path === 'string'
        ? () => action.path
        : id => `${base}/${id}/${name}`
  }

  return endpoints
}
