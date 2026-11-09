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
  eventos: Array<{ comando: string, motivo: string, plantilla?: string | null, confianza?: number | null, intentos?: number }>,
  opts: { appVersion?: string | null } = {}
): Promise<number> {
  if (!puestoId || !Array.isArray(eventos) || !eventos.length) return 0
  let guardados = 0
  for (const e of eventos) {
    const comando = String(e?.comando ?? '').trim().slice(0, 50)
    const motivo = String(e?.motivo ?? '').trim().slice(0, 60)
    if (!comando || !motivo) continue
    const plantilla = e?.plantilla ? String(e.plantilla).trim().slice(0, 120) : null
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
          claveHash,
          confianza,
          intentos,
          appVersion: opts.appVersion ?? null
        })
        .onConflictDoUpdate({
          target: [vozEventos.puestoId, vozEventos.claveHash],
          set: {
            plantilla: plantilla ?? vozEventos.plantilla,
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

export async function limpiarEventosVoz() {
  try {
    await db.execute(sql`DELETE FROM voz_eventos
      WHERE ultimo_en < NOW() - INTERVAL '30 days'
        AND intentos < 3
        AND (select count(*) from voz_eventos v2 where v2.plantilla = voz_eventos.plantilla) <= 1`)
  } catch (e) {
    console.warn('[vozEventos] cleanup failed', e)
  }
}
