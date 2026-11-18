import { sql } from 'drizzle-orm'
import { db } from '../database/client'
import { vozAciertos } from '../database/schema'

export interface AciertoVozEntrada {
  id: string
  comando: string
  resultado: string
  detalle?: string | null
  texto?: string | null
  confianza?: number | null
  creadoEn?: string | null
}

/** Fecha del dictado: si el reloj del equipo viene raro, manda el servidor. */
function fechaDe(valor: string | null | undefined): Date {
  if (!valor) return new Date()
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return new Date()
  // Un equipo con la hora adelantada no debe crear filas que nunca venzan.
  if (fecha.getTime() > Date.now()) return new Date()
  return fecha
}

/**
 * Guarda un lote de aciertos. `opts.capturarTexto` lo decide el servidor: el
 * cliente no puede imponer que se guarde la frase cruda.
 */
export async function registrarAciertosVoz(
  puestoId: string,
  dispositivoId: string | null,
  aciertos: AciertoVozEntrada[],
  opts: { appVersion?: string | null, capturarTexto?: boolean } = {}
): Promise<number> {
  if (!puestoId || !Array.isArray(aciertos) || !aciertos.length) return 0

  const filas = []
  for (const a of aciertos.slice(0, 200)) {
    const id = String(a?.id ?? '').trim()
    const comando = String(a?.comando ?? '').trim().slice(0, 50)
    const resultado = String(a?.resultado ?? '').trim().slice(0, 40)
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) continue
    if (!comando || !resultado) continue

    filas.push({
      id,
      puestoId,
      dispositivoId: dispositivoId ?? null,
      comando,
      resultado,
      detalle: a?.detalle ? String(a.detalle).trim().slice(0, 200) : null,
      texto: opts.capturarTexto && a?.texto ? String(a.texto).trim().slice(0, 300) : null,
      confianza: typeof a?.confianza === 'number' && Number.isFinite(a.confianza)
        ? a.confianza
        : null,
      appVersion: opts.appVersion ?? null,
      creadoEn: fechaDe(a?.creadoEn)
    })
  }

  if (!filas.length) return 0
  try {
    await db.insert(vozAciertos).values(filas).onConflictDoNothing({ target: vozAciertos.id })
    return filas.length
  } catch (e) {
    console.warn('[vozAciertos] insert failed', e)
    return 0
  }
}

/**
 * Borra aciertos por antigüedad o todos. La tarea programada usa `dias`; el
 * botón del panel usa `todos: true` para vaciar el diagnóstico de una vez.
 */
export async function limpiarAciertosVoz(
  { dias = 7, todos = false }: { dias?: number, todos?: boolean } = {}
): Promise<number> {
  const retencion = Math.min(90, Math.max(1, Math.trunc(Number(dias) || 7)))
  try {
    const res = todos
      ? await db.execute(sql`DELETE FROM voz_aciertos`)
      : await db.execute(sql`DELETE FROM voz_aciertos
          WHERE creado_en < NOW() - ${retencion} * INTERVAL '1 day'`)
    return Number((res as { rowCount?: number } | undefined)?.rowCount ?? 0)
  } catch (e) {
    console.warn('[vozAciertos] cleanup failed', e)
    return 0
  }
}
