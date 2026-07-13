import { z } from 'zod'

/**
 * shared/entities/_zod.js — Helpers para construir schemas zod desde la definición de una entity.
 *
 * Una entity declara sus fields como:
 *   { nombre: { type: 'string', required: true, max: 100 } }
 *
 * Y buildZodSchema(fields) produce:
 *   z.object({ nombre: z.string().min(1).max(100), ... })
 *
 * Los tipos soportados son los mismos que se usan en BaseForm:
 *   string | text | number | int | boolean | date | uuid | enum
 *
 * Para enums, se pasa `values: [...]`:
 *   { rol: { type: 'enum', values: ['jefe', 'trabajador'], required: true } }
 */

const TYPE_BUILDERS = {
  string: () => z.string(),
  text: () => z.string(),
  number: () => z.number(),
  int: () => z.number().int(),
  boolean: () => z.boolean(),
  date: () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)'),
  uuid: () => z.string().uuid(),
  enum: cfg => z.enum(cfg.values)
}

/**
 * Construye un schema zod a partir de un objeto { nombreField: cfg }.
 * Maneja required, min, max, default, optional/null.
 *
 * @param {Object} fieldsObj - Mapa { nombreField: { type, required?, min?, max?, default?, values? } }
 * @returns {z.ZodObject}
 */
export function buildZodSchema(fieldsObj) {
  const shape = {}
  for (const [name, cfg] of Object.entries(fieldsObj)) {
    const builder = TYPE_BUILDERS[cfg.type]
    if (!builder) {
      throw new Error(`Tipo de campo desconocido: "${cfg.type}" para "${name}"`)
    }
    let field = builder(cfg)
    if (cfg.min != null) field = field.min(cfg.min)
    if (cfg.max != null) field = field.max(cfg.max)
    if (cfg.default !== undefined) field = field.default(cfg.default)
    if (cfg.nullable) field = field.nullable()
    if (!cfg.required) field = field.optional().nullable()
    shape[name] = field
  }
  return z.object(shape)
}
