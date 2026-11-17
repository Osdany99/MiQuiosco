import { eq, sql } from 'drizzle-orm'
import { requireSuperAdmin } from '../../../utils/auth'
import { db } from '../../../database/client'
import { vozLexico } from '../../../database/schema'
import { validarEntrada, lexicoEntradaSchema, CATEGORIAS_LEXICO } from '#shared/schemas/vozLexico'
import { LEXICO_BASE } from '#shared/voz/lexico'

/** Palabras del léxico base, para detectar conflictos con las nuevas. */
function baseToEntries() {
  const map = {
    venta_fuerte: LEXICO_BASE.ventaFuerte,
    venta_debil: LEXICO_BASE.ventaDebil,
    consulta_marca: LEXICO_BASE.consultaMarca
  } as Record<string, string[]>
  const out = []
  for (const cat of CATEGORIAS_LEXICO) {
    for (const v of map[cat] || []) out.push({ categoria: cat, valor: v, activo: true })
  }
  return out
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody(event).catch(() => ({}))
  const parsed = lexicoEntradaSchema.safeParse(body ?? {})
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Payload inválido.', data: parsed.error.flatten() })
  }

  const creadoPor = null
  const dbActivos = await db.select().from(vozLexico).where(eq(vozLexico.activo, true))
  const efectivo = baseToEntries().concat(dbActivos.map(r => ({ categoria: r.categoria, valor: r.valor, clave: r.clave ?? undefined, activo: r.activo })))
  const v = validarEntrada(parsed.data, efectivo)
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
