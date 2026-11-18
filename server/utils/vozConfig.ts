import { eq, sql } from 'drizzle-orm'

import { db } from '../database/client'
import { vozConfig } from '../database/schema'
import type { VozConfig } from '../database/schema'
import { normalizarVozConfig } from '#shared/voz/config'

/**
 * Configuración de flota de la voz.
 *
 * Hay una sola fila (`id = 1`). Se crea perezosamente con los valores por
 * defecto para que un despliegue nuevo no dependa de un seed.
 */

const FILA = 1

function normalizar(fila: Partial<VozConfig> | null | undefined) {
  return normalizarVozConfig({
    wake: fila?.wake,
    motor: fila?.motor,
    idioma: fila?.idioma,
    retencionDias: fila?.retencionDias,
    capturarTexto: fila?.capturarTexto,
    capturarAciertos: fila?.capturarAciertos,
    retencionAciertosDias: fila?.retencionAciertosDias,
    version: fila?.version,
    actualizadoEn: fila?.actualizadoEn instanceof Date
      ? fila.actualizadoEn.toISOString()
      : fila?.actualizadoEn
  })
}

export async function leerVozConfig() {
  const [fila] = await db
    .select()
    .from(vozConfig)
    .where(eq(vozConfig.id, FILA))
    .limit(1)
  if (fila) return normalizar(fila)

  // Dos primeras peticiones a la vez no deben chocar: la segunda no inserta.
  const [creada] = await db
    .insert(vozConfig)
    .values({ id: FILA })
    .onConflictDoNothing()
    .returning()
  if (creada) return normalizar(creada)

  const [existente] = await db
    .select()
    .from(vozConfig)
    .where(eq(vozConfig.id, FILA))
    .limit(1)
  return normalizar(existente)
}

interface DatosVozConfig {
  wake: string
  motor: string
  idioma: string
  retencionDias: number
  capturarTexto: boolean
  capturarAciertos: boolean
  retencionAciertosDias: number
}

export async function guardarVozConfig(
  datos: DatosVozConfig,
  usuarioId: string | null = null
) {
  const [fila] = await db
    .update(vozConfig)
    .set({
      wake: datos.wake,
      motor: datos.motor,
      idioma: datos.idioma,
      retencionDias: datos.retencionDias,
      capturarTexto: datos.capturarTexto,
      capturarAciertos: datos.capturarAciertos,
      retencionAciertosDias: datos.retencionAciertosDias,
      version: sql`${vozConfig.version} + 1`,
      actualizadoEn: new Date(),
      actualizadoPor: usuarioId
    })
    .where(eq(vozConfig.id, FILA))
    .returning()

  if (fila) return normalizar(fila)
  // La fila no existía (base recién creada): se crea con los valores enviados.
  const [creada] = await db
    .insert(vozConfig)
    .values({
      id: FILA,
      wake: datos.wake,
      motor: datos.motor,
      idioma: datos.idioma,
      retencionDias: datos.retencionDias,
      capturarTexto: datos.capturarTexto,
      capturarAciertos: datos.capturarAciertos,
      retencionAciertosDias: datos.retencionAciertosDias,
      version: 1,
      actualizadoPor: usuarioId
    })
    .onConflictDoUpdate({
      target: vozConfig.id,
      set: {
        wake: datos.wake,
        motor: datos.motor,
        idioma: datos.idioma,
        retencionDias: datos.retencionDias,
        capturarTexto: datos.capturarTexto,
        capturarAciertos: datos.capturarAciertos,
        retencionAciertosDias: datos.retencionAciertosDias,
        version: sql`${vozConfig.version} + 1`,
        actualizadoEn: new Date(),
        actualizadoPor: usuarioId
      }
    })
    .returning()
  return normalizar(creada)
}
