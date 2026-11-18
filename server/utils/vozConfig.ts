import { desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'

import { db } from '../database/client'
import {
  dispositivos,
  puestos,
  vozConfig,
  vozConfigDispositivo
} from '../database/schema'
import type { VozConfigDispositivo } from '../database/schema'
import {
  normalizarVozConfig,
  normalizarVozOverride,
  overrideVacio
} from '#shared/voz/config'

/**
 * Configuración de voz: flota + override por equipo.
 *
 * Hay una sola fila de flota (`voz_config.id = 1`) que el super_admin edita en
 * `/admin/voz-configuracion`. Cada aparato puede pisar motor, idioma o palabra
 * clave en `voz_config_dispositivo` (un campo en `null` hereda de la flota).
 *
 * La resolución vive aquí porque la necesitan tres sitios: el propio equipo
 * (`GET /api/voz/config`), el panel de dispositivos y los endpoints de admin.
 */

const FILA = 1

/**
 * La `version` que viaja al equipo es la de flota escalada + la del equipo.
 * Así un solo número sigue sirviendo para el `watch` del cliente y para
 * "¿tengo que volver a aplicar?" sin tocar la app ya instalada.
 */
const FACTOR_VERSION = 10000
const TOPE_VERSION_EQUIPO = FACTOR_VERSION - 1

export interface VozConfigBase {
  wake: string
  motor: string
  idioma: string
  retencionDias: number
  capturarTexto: boolean
  capturarAciertos: boolean
  retencionAciertosDias: number
  version: number
  actualizadoEn: string | null
}

export interface VozConfigResuelta extends VozConfigBase {
  /** De dónde salieron los valores efectivos. */
  origen: 'flota' | 'dispositivo'
  versionFlota: number
  versionDispositivo: number
}

/** Fila de `voz_config` tal como llega de la base (fechas incluidas). */
interface FilaVozConfig {
  wake?: string | null
  motor?: string | null
  idioma?: string | null
  retencionDias?: number | null
  capturarTexto?: boolean | null
  capturarAciertos?: boolean | null
  retencionAciertosDias?: number | null
  version?: number | null
  actualizadoEn?: Date | string | null
}

function fechaIso(valor: unknown): string | null {
  if (!valor) return null
  // Puede llegar como Date (drizzle) o como string ya serializado.
  const fecha = new Date(valor as string | number | Date)
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString()
}

function normalizarFlota(fila: FilaVozConfig | null | undefined) {
  return normalizarVozConfig({
    wake: fila?.wake,
    motor: fila?.motor,
    idioma: fila?.idioma,
    retencionDias: fila?.retencionDias,
    capturarTexto: fila?.capturarTexto,
    capturarAciertos: fila?.capturarAciertos,
    retencionAciertosDias: fila?.retencionAciertosDias,
    version: fila?.version,
    actualizadoEn: fechaIso(fila?.actualizadoEn)
  })
}

function componerVersion(flota: number, equipo: number) {
  const propio = Math.min(Math.max(0, Math.trunc(equipo)), TOPE_VERSION_EQUIPO)
  return Math.max(0, Math.trunc(flota)) * FACTOR_VERSION + propio
}

/** Configuración de flota tal cual (el valor por defecto de todos los equipos). */
export async function leerVozConfigFlota(): Promise<VozConfigBase> {
  const [fila] = await db
    .select()
    .from(vozConfig)
    .where(eq(vozConfig.id, FILA))
    .limit(1)
  if (fila) return normalizarFlota(fila)

  // Dos primeras peticiones a la vez no deben chocar: la segunda no inserta.
  const [creada] = await db
    .insert(vozConfig)
    .values({ id: FILA })
    .onConflictDoNothing()
    .returning()
  if (creada) return normalizarFlota(creada)

  const [existente] = await db
    .select()
    .from(vozConfig)
    .where(eq(vozConfig.id, FILA))
    .limit(1)
  return normalizarFlota(existente)
}

/** Configuración efectiva: flota con el override del equipo aplicado encima. */
export async function leerVozConfig(
  dispositivoId: string | null = null
): Promise<VozConfigResuelta> {
  const flota = await leerVozConfigFlota()
  if (!dispositivoId) return resolverVoz(flota, null)

  const [fila] = await db
    .select()
    .from(vozConfigDispositivo)
    .where(eq(vozConfigDispositivo.dispositivoId, dispositivoId))
    .limit(1)

  return resolverVoz(flota, fila ?? null)
}

/** Aplica un override (o nada) sobre la flota. Puro: no toca la base. */
export function resolverVoz(
  flota: VozConfigBase,
  override: Partial<VozConfigDispositivo> | null
): VozConfigResuelta {
  const propio = override ? normalizarVozOverride(override) : null
  const versionEquipo = propio?.version ?? 0
  // La versión lleva SIEMPRE la parte del equipo, incluso si hoy no pisa nada:
  // si no, limpiar el override devolvería una versión vieja y el aparato no
  // volvería a aplicar los valores de flota.
  const version = versionEquipo > 0
    ? componerVersion(flota.version, versionEquipo)
    : flota.version

  if (!propio || overrideVacio(propio)) {
    return {
      ...flota,
      version,
      origen: 'flota',
      versionFlota: flota.version,
      versionDispositivo: versionEquipo
    }
  }

  const efectiva = normalizarVozConfig({
    ...flota,
    motor: propio.motor ?? flota.motor,
    idioma: propio.idioma ?? flota.idioma,
    wake: propio.wake ?? flota.wake,
    version
  })

  return {
    ...efectiva,
    origen: 'dispositivo',
    versionFlota: flota.version,
    versionDispositivo: versionEquipo
  }
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

/** Guarda la flota. Sube `version`, que es lo que miran los equipos. */
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

  if (fila) return normalizarFlota(fila)
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
  return normalizarFlota(creada)
}

// ── Override por equipo ────────────────────────────────────────────────────

export interface DatosVozOverride {
  motor?: string | null
  idioma?: string | null
  wake?: string | null
}

/** Lanza 404 si el equipo no existe: se llama antes de escribir el override. */
async function exigirDispositivo(dispositivoId: string) {
  const [fila] = await db
    .select({ id: dispositivos.id })
    .from(dispositivos)
    .where(eq(dispositivos.id, dispositivoId))
    .limit(1)
  if (!fila) {
    throw createError({ statusCode: 404, statusMessage: 'Dispositivo no encontrado.' })
  }
}

/**
 * Guarda el override del equipo. Si no pisa nada (todo `null`) la fila **no se
 * borra**: se vacía y sube `version`, que es lo que hace que el aparato vuelva a
 * aplicar la flota (borrarla dejaría la versión vieja y no regresaría).
 */
export async function guardarVozConfigDispositivo(
  dispositivoId: string,
  datos: DatosVozOverride,
  usuarioId: string | null = null
) {
  await exigirDispositivo(dispositivoId)

  const override = normalizarVozOverride(datos)
  const valores = {
    motor: override.motor,
    idioma: override.idioma,
    wake: override.wake
  }

  const [fila] = await db
    .insert(vozConfigDispositivo)
    .values({
      dispositivoId,
      ...valores,
      version: 1,
      actualizadoEn: new Date(),
      actualizadoPor: usuarioId
    })
    .onConflictDoUpdate({
      target: vozConfigDispositivo.dispositivoId,
      set: {
        ...valores,
        version: sql`${vozConfigDispositivo.version} + 1`,
        actualizadoEn: new Date(),
        actualizadoPor: usuarioId
      }
    })
    .returning()

  return fila ?? null
}

/**
 * Aplica el mismo override a todos los equipos de un puesto (o lo vacía si
 * viene todo en `null`). Devuelve cuántos equipos se tocaron.
 *
 * Igual que en el override individual: vaciar no borra, sube `version` para
 * que cada aparato vuelva a aplicar la flota.
 */
export async function guardarVozConfigPuesto(
  puestoId: string,
  datos: DatosVozOverride,
  usuarioId: string | null = null
): Promise<number> {
  const equipos = await db
    .select({ id: dispositivos.id })
    .from(dispositivos)
    .where(eq(dispositivos.puestoId, puestoId))

  if (!equipos.length) return 0
  const ids = equipos.map(equipo => equipo.id)

  const override = normalizarVozOverride(datos)
  const valores = {
    motor: override.motor,
    idioma: override.idioma,
    wake: override.wake
  }
  const ahora = new Date()

  await db
    .insert(vozConfigDispositivo)
    .values(ids.map(id => ({
      dispositivoId: id,
      ...valores,
      version: 1,
      actualizadoEn: ahora,
      actualizadoPor: usuarioId
    })))
    .onConflictDoUpdate({
      target: vozConfigDispositivo.dispositivoId,
      set: {
        ...valores,
        version: sql`${vozConfigDispositivo.version} + 1`,
        actualizadoEn: ahora,
        actualizadoPor: usuarioId
      }
    })

  return ids.length
}

/** Equipos con configuración propia, para la tabla del panel de voz. */
export async function listarOverridesVoz() {
  const filas = await db
    .select({
      dispositivoId: vozConfigDispositivo.dispositivoId,
      dispositivoNombre: dispositivos.nombre,
      modelo: dispositivos.modelo,
      puestoId: dispositivos.puestoId,
      puestoNombre: puestos.nombre,
      motor: vozConfigDispositivo.motor,
      idioma: vozConfigDispositivo.idioma,
      wake: vozConfigDispositivo.wake,
      version: vozConfigDispositivo.version,
      actualizadoEn: vozConfigDispositivo.actualizadoEn
    })
    .from(vozConfigDispositivo)
    .leftJoin(dispositivos, eq(dispositivos.id, vozConfigDispositivo.dispositivoId))
    .leftJoin(puestos, eq(puestos.id, dispositivos.puestoId))
    // Las filas vaciadas quedan solo como marca de versión: no son configuración.
    .where(or(
      isNotNull(vozConfigDispositivo.motor),
      isNotNull(vozConfigDispositivo.idioma),
      isNotNull(vozConfigDispositivo.wake)
    ))
    .orderBy(desc(vozConfigDispositivo.actualizadoEn))

  return { overrides: filas, total: filas.length }
}

/**
 * Todo lo que necesita el panel para el bloque «voz de este equipo»: la flota,
 * el override (si hay) y lo que el aparato reportó de sí mismo.
 */
export async function leerVozDispositivoAdmin(dispositivoId: string) {
  const [equipo] = await db
    .select({
      id: dispositivos.id,
      nombre: dispositivos.nombre,
      modelo: dispositivos.modelo,
      puestoId: dispositivos.puestoId,
      puestoNombre: puestos.nombre,
      vozMotor: dispositivos.vozMotor,
      vozVosk: dispositivos.vozVosk,
      vozStt: dispositivos.vozStt
    })
    .from(dispositivos)
    .leftJoin(puestos, eq(puestos.id, dispositivos.puestoId))
    .where(eq(dispositivos.id, dispositivoId))
    .limit(1)

  if (!equipo) {
    throw createError({ statusCode: 404, statusMessage: 'Dispositivo no encontrado.' })
  }

  const [flota, override] = await Promise.all([
    leerVozConfigFlota(),
    db
      .select()
      .from(vozConfigDispositivo)
      .where(eq(vozConfigDispositivo.dispositivoId, dispositivoId))
      .limit(1)
      .then(filas => filas[0] ?? null)
  ])

  return {
    dispositivo: equipo,
    flota,
    override: override
      ? {
          motor: override.motor,
          idioma: override.idioma,
          wake: override.wake,
          version: override.version,
          actualizadoEn: override.actualizadoEn
        }
      : null,
    efectiva: resolverVoz(flota, override)
  }
}

/**
 * Override de voz de varios equipos en una sola consulta. Lo usa el listado del
 * panel para no hacer una consulta por fila.
 */
export async function overridesPorDispositivo(ids: string[]) {
  const salida = new Map<string, { motor: string | null, idioma: string | null, wake: string | null }>()
  if (!ids.length) return salida

  const filas = await db
    .select({
      dispositivoId: vozConfigDispositivo.dispositivoId,
      motor: vozConfigDispositivo.motor,
      idioma: vozConfigDispositivo.idioma,
      wake: vozConfigDispositivo.wake
    })
    .from(vozConfigDispositivo)
    .where(inArray(vozConfigDispositivo.dispositivoId, ids))

  for (const fila of filas) {
    salida.set(fila.dispositivoId, {
      motor: fila.motor,
      idioma: fila.idioma,
      wake: fila.wake
    })
  }
  return salida
}
