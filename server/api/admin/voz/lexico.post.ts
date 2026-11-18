import { eq, sql } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozLexico } from '../../../database/schema'
import {
  validarEntrada,
  lexicoEntradaSchema
} from '#shared/schemas/vozLexico'
import { entradasLexicoBase } from '#shared/voz/lexico'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const parsed = lexicoEntradaSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Payload inválido.', data: parsed.error.flatten() })
  }

  const creadoPor = null
  const dbActivos = await db.select().from(vozLexico).where(eq(vozLexico.activo, true))
  const efectivo = entradasLexicoBase().concat(
    dbActivos.map(r => ({
      categoria: r.categoria,
      valor: r.valor,
      clave: r.clave ?? undefined,
      activo: r.activo
    }))
  )
  const v = validarEntrada(parsed.data, efectivo, entradasLexicoBase())
  if (!v.ok) {
    throw createError({ statusCode: 409, statusMessage: `Entrada inválida: ${v.motivo}` })
  }

  const [maxRow] = await db.select({ m: sql`coalesce(max(${vozLexico.version}), 0)` }).from(vozLexico)
  const version = Number(maxRow?.m || 0) + 1

  const values = {
    categoria: parsed.data.categoria,
    valor: parsed.data.valor,
    // El léxico ya no tiene destinos: la columna se conserva en NULL.
    clave: null,
    activo: parsed.data.activo ?? true,
    version,
    creadoPor,
    nota: typeof body?.nota === 'string' ? body.nota : null
  }

  const [row] = await db
    .insert(vozLexico)
    .values(values)
    .onConflictDoUpdate({
      target: [vozLexico.categoria, vozLexico.valor],
      set: {
        activo: values.activo,
        clave: values.clave,
        version,
        nota: values.nota,
        actualizadoEn: sql`now()`
      }
    })
    .returning()

  return row
})
