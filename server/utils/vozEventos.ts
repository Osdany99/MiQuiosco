import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { db } from '../database/client'
import { vozEventos } from '../database/schema'

function claveHashDe(comando: string, motivo: string, plantilla: string | null | undefined) {
  return createHash('sha256').update(`${comando}|${motivo}|${plantilla ?? ''}`, 'utf8').digest('hex')
}

export async function registrarEventosVoz(
  puestoId: string,
  _dispositivoId: string | null,
  eventos: Array<{ comando: string, motivo: string, plantilla?: string | null, texto?: string | null, confianza?: number | null, intentos?: number }>,
  opts: { appVersion?: string | null, capturarTexto?: boolean } = {}
): Promise<number> {
  if (!puestoId || !Array.isArray(eventos) || !eventos.length) return 0
  let guardados = 0
  for (const e of eventos) {
    const comando = String(e?.comando ?? '').trim().slice(0, 50)
    const motivo = String(e?.motivo ?? '').trim().slice(0, 60)
    if (!comando || !motivo) continue
    const plantilla = e?.plantilla ? String(e.plantilla).trim().slice(0, 120) : null
    // El flag manda en el servidor: aunque un cliente mande texto, sin
    // `capturarTexto` no se guarda.
    const texto = opts.capturarTexto && e?.texto ? String(e.texto).trim().slice(0, 200) : null
    const claveHash = claveHashDe(comando, motivo, plantilla)
    const intentos = Math.max(1, Math.min(100000, Number(e.intentos) || 1))
    const confianza = typeof e.confianza === 'number' && Number.isFinite(e.confianza) ? e.confianza : null
    try {
      await db
        .insert(vozEventos)
        .values({
          puestoId,
          dispositivoId: _dispositivoId,
          comando,
          motivo,
          plantilla,
          texto,
          claveHash,
          confianza,
          intentos,
          appVersion: opts.appVersion ?? null
        })
        .onConflictDoUpdate({
          target: [vozEventos.puestoId, vozEventos.claveHash],
          set: {
            plantilla: plantilla ?? vozEventos.plantilla,
            texto: texto ?? vozEventos.texto,
            intentos: sql`${vozEventos.intentos} + ${intentos}`,
            confianza: confianza ?? vozEventos.confianza,
            ultimoEn: sql`now()`,
            appVersion: opts.appVersion ?? vozEventos.appVersion
          }
        })
      guardados++
    } catch (e) {
      console.warn('[vozEventos] upsert failed', e)
    }
  }
  return guardados
}

/**
 * Borra eventos antiguos según la retención de flota.
 *
 * Se conservan los eventos con 3+ intentos (siguen siendo útiles para el
 * léxico) y las plantillas que comparten fila con otro evento. La tarea
 * programada (`voz:retencion`) y el botón del panel pasan por aquí.
 */
export async function limpiarEventosVoz({ dias = 30 }: { dias?: number } = {}) {
  const retencion = Math.min(365, Math.max(7, Math.trunc(Number(dias) || 30)))
  try {
    const res = await db.execute(sql`DELETE FROM voz_eventos
      WHERE ultimo_en < NOW() - ${retencion} * INTERVAL '1 day'
        AND intentos < 3
        AND (select count(*) from voz_eventos v2 where v2.plantilla = voz_eventos.plantilla) <= 1`)
    return Number((res as { rowCount?: number } | undefined)?.rowCount ?? 0)
  } catch (e) {
    console.warn('[vozEventos] cleanup failed', e)
    return 0
  }
}
