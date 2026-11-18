import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db } from '../database/client'
import { dispositivos, syncFallos } from '../database/schema'
import { claveFallo } from '#shared/syncFallos'

/**
 * Registro central de fallos de sincronización (Fase 3).
 *
 * Todo es best-effort: un fallo al guardar un fallo jamás debe tumbar un push,
 * un pull ni un login. El APK conserva su copia en el buzón local, así que si
 * esta escritura se pierde, la siguiente sync la vuelve a mandar.
 */

const MAX_TEXTO = 2000
const MAX_JSON = 16000
const CLAVES_SECRETAS = /pin|token|authorization|password|contrase|secret/i

/**
 * Copia el valor quitando claves sensibles y recortando tamaños. Se aplica
 * siempre, aunque el cliente ya haya redactado: es la última barrera antes de
 * escribir en Postgres.
 */
export function redactarJson(valor: unknown, profundidad = 0): unknown {
  if (valor == null) return null
  if (profundidad > 3) return '[…]'

  if (typeof valor === 'string') {
    return valor.length > 500 ? `${valor.slice(0, 500)}…` : valor
  }
  if (typeof valor !== 'object') return valor

  if (Array.isArray(valor)) {
    return valor.slice(0, 20).map(v => redactarJson(v, profundidad + 1))
  }

  const salida: Record<string, unknown> = {}
  for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
    salida[clave] = CLAVES_SECRETAS.test(clave)
      ? '[REDACTADO]'
      : redactarJson(v, profundidad + 1)
  }
  return salida
}

/** JSONB acotado: si el objeto es enorme se guarda un resumen truncado. */
function limitarJson(valor: unknown): unknown {
  if (valor == null) return null
  const redactado = redactarJson(valor)
  let texto: string
  try {
    texto = JSON.stringify(redactado)
  } catch {
    return null
  }
  if (texto.length <= MAX_JSON) return redactado
  return { truncado: true, json: texto.slice(0, MAX_JSON) }
}

function texto(valor: unknown, max = MAX_TEXTO): string | null {
  if (valor == null) return null
  const limpio = String(valor).trim()
  return limpio ? limpio.slice(0, max) : null
}

/**
 * Fecha del fallo según el aparato. Se acota a un rango razonable para que un
 * reloj mal puesto (los hay adelantados) no rompa el orden del panel.
 */
function fechaFallo(valor: unknown): Date {
  const ahora = Date.now()
  const ms = typeof valor === 'number'
    ? valor
    : typeof valor === 'string'
      ? Date.parse(valor)
      : NaN

  const minimo = Date.UTC(2020, 0, 1)
  const maximo = ahora + 7 * 24 * 60 * 60 * 1000
  if (!Number.isFinite(ms) || ms < minimo || ms > maximo) return new Date(ahora)
  return new Date(ms)
}

export interface EntradaFallo {
  tipo: string
  fase?: string | null
  tabla?: string | null
  registroId?: string | null
  loteId?: string | null
  codigoHttp?: number | null
  motivo?: string | null
  mensaje?: string | null
  fila?: unknown
  contexto?: unknown
  appVersion?: string | null
  dispositivo?: string | null
  ocurridoEn?: string | number | null
  intentos?: number
}

export interface ExtraFallo {
  appVersion?: string | null
  dispositivo?: string | null
}

/** sha256 de la clave estable. Es lo que deduplica un fallo por puesto. */
export function hashClave(entrada: EntradaFallo): string {
  return createHash('sha256')
    .update(claveFallo(entrada))
    .digest('hex')
}

async function dispositivoExiste(id: string | null): Promise<boolean> {
  if (!id) return false
  try {
    const [fila] = await db
      .select({ id: dispositivos.id })
      .from(dispositivos)
      .where(eq(dispositivos.id, id))
      .limit(1)
    return !!fila
  } catch {
    return false
  }
}

/**
 * Guarda (o incrementa) los fallos. Devuelve cuántos se escribieron bien.
 *
 * Dedupe: `(puesto_id, clave_hash)` es único; un fallo repetido sube
 * `intentos` y `ultimo_en` en vez de crear filas nuevas.
 */
export async function registrarFallos(
  puestoId: string,
  dispositivoId: string | null,
  entradas: EntradaFallo[],
  extra: ExtraFallo = {}
): Promise<number> {
  if (!entradas.length) return 0

  // La FK a `dispositivos` es estricta: si el equipo aún no fue provisionado
  // (token emitido antes de la Fase 2), se guarda el fallo sin dispositivo.
  const dispositivoValido = await dispositivoExiste(dispositivoId)
  const dispositivoIdFinal = dispositivoValido ? dispositivoId : null

  let guardados = 0

  for (const entrada of entradas) {
    try {
      const claveHash = hashClave(entrada)
      const ocurrido = fechaFallo(entrada.ocurridoEn)
      const intentos = Math.max(1, Math.min(1_000_000, Number(entrada.intentos) || 1))
      const ahora = new Date()

      const valores = {
        puestoId,
        dispositivoId: dispositivoIdFinal,
        claveHash,
        tipo: texto(entrada.tipo, 40) ?? 'otro',
        fase: texto(entrada.fase, 20),
        tabla: texto(entrada.tabla, 60),
        registroId: texto(entrada.registroId, 100),
        loteId: texto(entrada.loteId, 60),
        codigoHttp: typeof entrada.codigoHttp === 'number' && Number.isFinite(entrada.codigoHttp)
          ? Math.trunc(entrada.codigoHttp)
          : null,
        motivo: texto(entrada.motivo, 80),
        mensaje: texto(entrada.mensaje),
        fila: limitarJson(entrada.fila),
        contexto: limitarJson(entrada.contexto),
        appVersion: texto(entrada.appVersion ?? extra.appVersion, 32),
        dispositivo: texto(entrada.dispositivo ?? extra.dispositivo, 80),
        intentos
      }

      await db
        .insert(syncFallos)
        .values({
          ...valores,
          creadoEn: ocurrido,
          ultimoEn: ahora
        })
        .onConflictDoUpdate({
          target: [syncFallos.puestoId, syncFallos.claveHash],
          set: {
            // El dispositivo de la última ocurrencia es el más útil para el panel.
            dispositivoId: dispositivoIdFinal,
            mensaje: valores.mensaje,
            fila: valores.fila,
            contexto: valores.contexto,
            codigoHttp: valores.codigoHttp,
            appVersion: valores.appVersion,
            dispositivo: valores.dispositivo,
            intentos: sql`${syncFallos.intentos} + ${intentos}`,
            ultimoEn: ahora
          }
        })

      guardados++
    } catch (err) {
      // Un fallo de telemetría nunca rompe la operación que lo originó.
      console.error('[sync_fallos] no se pudo guardar el fallo:', err)
    }
  }

  return guardados
}
