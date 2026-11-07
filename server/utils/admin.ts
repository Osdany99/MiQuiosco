/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { db } from '../database/client'
import {
  accesos,
  dispositivos,
  puestos,
  syncFallos,
  usuarios
} from '../database/schema'
import { hashPin } from './auth'

/**
 * server/utils/admin.ts — lógica del panel de super administración (Fase 4).
 *
 * Todo lo de aquí es de plataforma (puestos, jefes, dispositivos y fallos de
 * sync), nunca datos de negocio. Los endpoints `/api/admin/*` solo comprueban
 * el guard y delegan en estas funciones.
 */

const MAX_FALLOS = 200
const MAX_DISPOSITIVOS = 300

export interface NuevoPuestoAdmin {
  nombre: string
  activo?: boolean
  jefe: {
    nombre: string
    pin: string
    telefono?: string | null
    notas?: string | null
  }
}

export interface CambiosPuestoAdmin {
  nombre?: string
  activo?: boolean
  permisos?: Record<string, any>
}

export interface CambiosJefeAdmin {
  nombre?: string
  telefono?: string | null
  notas?: string | null
  activo?: boolean
  salario?: number | null
}

export type EstadoFallo = 'abierto' | 'resuelto' | 'todos'

export interface FiltrosFallosAdmin {
  puestoId?: string
  dispositivoId?: string
  tipo?: string
  motivo?: string
  tabla?: string
  estado?: EstadoFallo
  limit?: number
  offset?: number
}

export interface FiltrosDispositivosAdmin {
  puestoId?: string
  revocado?: boolean
  q?: string
  limit?: number
  offset?: number
}

/** Fila de usuario sin secretos. */
function serializarUsuario(fila: any) {
  if (!fila) return null
  const copia = { ...fila }
  delete copia.pinHash
  delete copia.tokenVersion
  return copia
}

function serializarPuesto(fila: any) {
  if (!fila) return null
  return {
    id: fila.id,
    nombre: fila.nombre,
    activo: fila.activo,
    central: fila.central,
    permisos: fila.permisos ?? {},
    creadoEn: fila.creadoEn
  }
}

export function esConflictoUnico(err: any): boolean {
  return err?.code === '23505'
}

/** Query string seguro: ignora arrays, vacíos y valores no textuales. */
export function textoQuery(valor: unknown): string | undefined {
  if (typeof valor !== 'string') return undefined
  const limpio = valor.trim()
  return limpio || undefined
}

/** Entero de query string, acotado por `max` cuando se indica. */
export function numeroQuery(valor: unknown, max?: number): number | undefined {
  const texto = textoQuery(valor)
  if (!texto) return undefined
  const numero = Number(texto)
  if (!Number.isFinite(numero)) return undefined
  const entero = Math.trunc(numero)
  if (entero < 0) return 0
  return max != null ? Math.min(entero, max) : entero
}

/** `true`/`false` de query string; cualquier otra cosa se ignora. */
export function booleanoQuery(valor: unknown): boolean | undefined {
  const texto = textoQuery(valor)?.toLowerCase()
  if (texto === 'true' || texto === '1') return true
  if (texto === 'false' || texto === '0') return false
  return undefined
}

/**
 * Puestos con sus contadores y sus jefes. Una sola consulta por tabla, sin N+1:
 * los contadores son subconsultas correlacionadas y los jefes se agrupan en
 * memoria.
 */
export async function listarPuestosAdmin() {
  const filas = await db
    .select({
      id: puestos.id,
      nombre: puestos.nombre,
      activo: puestos.activo,
      central: puestos.central,
      permisos: puestos.permisos,
      creadoEn: puestos.creadoEn,
      dispositivos: sql<number>`(select count(*)::int from ${dispositivos} where ${dispositivos.puestoId} = ${puestos.id})`,
      dispositivosRevocados: sql<number>`(select count(*)::int from ${dispositivos} where ${dispositivos.puestoId} = ${puestos.id} and ${dispositivos.revocado} = true)`,
      ultimaSyncOkEn: sql<Date | null>`(select max(${dispositivos.ultimaSyncOkEn}) from ${dispositivos} where ${dispositivos.puestoId} = ${puestos.id})`,
      fallosAbiertos: sql<number>`(select count(*)::int from ${syncFallos} where ${syncFallos.puestoId} = ${puestos.id} and ${syncFallos.resueltoEn} is null)`
    })
    .from(puestos)
    // El puesto central primero: es el que aloja al super admin.
    .orderBy(desc(puestos.central), asc(puestos.nombre))

  const jefes = await db
    .select({
      id: usuarios.id,
      puestoId: usuarios.puestoId,
      nombre: usuarios.nombre,
      telefono: usuarios.telefono,
      notas: usuarios.notas,
      activo: usuarios.activo,
      salario: usuarios.salario,
      creadoEn: usuarios.creadoEn,
      actualizadoEn: usuarios.actualizadoEn
    })
    .from(usuarios)
    .where(eq(usuarios.rol, 'jefe'))
    .orderBy(asc(usuarios.nombre))

  const porPuesto = new Map<string, any[]>()
  for (const jefe of jefes) {
    const lista = porPuesto.get(jefe.puestoId) ?? []
    lista.push(jefe)
    porPuesto.set(jefe.puestoId, lista)
  }

  return filas.map(fila => ({
    ...fila,
    jefes: porPuesto.get(fila.id) ?? []
  }))
}

/**
 * Crea el puesto y su jefe en una transacción. Si el nombre del jefe ya existe
 * (índice único global) no queda un puesto huérfano.
 */
export async function crearPuestoAdmin(datos: NuevoPuestoAdmin) {
  const nombrePuesto = datos.nombre.trim()
  const nombreJefe = datos.jefe.nombre.trim()
  const pinHash = await hashPin(datos.jefe.pin)

  return db.transaction(async (tx) => {
    // Comprobación explícita para devolver 409 con un mensaje útil; el índice
    // único sigue protegiendo ante una carrera entre dos altas simultáneas.
    const [duplicado] = await tx
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(eq(usuarios.nombre, nombreJefe))
      .limit(1)

    if (duplicado) {
      throw createError({
        statusCode: 409,
        statusMessage: `Ya existe un usuario con el nombre «${nombreJefe}».`
      })
    }

    const [puesto] = await tx
      .insert(puestos)
      .values({
        nombre: nombrePuesto,
        activo: datos.activo ?? true,
        central: false
      })
      .returning()

    const [jefe] = await tx
      .insert(usuarios)
      .values({
        puestoId: puesto!.id,
        nombre: nombreJefe,
        rol: 'jefe',
        pinHash,
        telefono: datos.jefe.telefono ?? null,
        notas: datos.jefe.notas ?? null,
        activo: true
      })
      .returning()

    return {
      puesto: serializarPuesto(puesto),
      jefe: serializarUsuario(jefe)
    }
  })
}

export async function actualizarPuestoAdmin(id: string, cambios: CambiosPuestoAdmin) {
  const [actual] = await db
    .select({ id: puestos.id, central: puestos.central })
    .from(puestos)
    .where(eq(puestos.id, id))
    .limit(1)

  if (!actual) {
    throw createError({ statusCode: 404, statusMessage: 'Puesto no encontrado.' })
  }

  const cambiosDb: Record<string, any> = {}
  if (cambios.nombre !== undefined) cambiosDb.nombre = cambios.nombre.trim()
  if (cambios.activo !== undefined) cambiosDb.activo = cambios.activo
  if (cambios.permisos !== undefined) cambiosDb.permisos = cambios.permisos

  if (!Object.keys(cambiosDb).length) {
    throw createError({ statusCode: 400, statusMessage: 'No hay cambios que aplicar.' })
  }

  const [fila] = await db
    .update(puestos)
    .set(cambiosDb)
    .where(eq(puestos.id, id))
    .returning()

  return serializarPuesto(fila)
}

/**
 * Edita al jefe de un puesto. Solo se administran jefes y super admins: los
 * trabajadores/clientes no forman parte del panel.
 */
export async function actualizarJefeAdmin(id: string, cambios: CambiosJefeAdmin) {
  const [actual] = await db
    .select({
      id: usuarios.id,
      nombre: usuarios.nombre,
      rol: usuarios.rol,
      puestoId: usuarios.puestoId
    })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1)

  if (!actual) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }
  if (actual.rol !== 'jefe' && actual.rol !== 'super_admin') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Solo se pueden administrar jefes de puesto o super administradores.'
    })
  }

  const cambiosDb: Record<string, any> = {}

  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim()
    if (nombre !== actual.nombre) {
      const [duplicado] = await db
        .select({ id: usuarios.id })
        .from(usuarios)
        .where(eq(usuarios.nombre, nombre))
        .limit(1)
      if (duplicado && duplicado.id !== id) {
        throw createError({
          statusCode: 409,
          statusMessage: `Ya existe un usuario con el nombre «${nombre}».`
        })
      }
    }
    cambiosDb.nombre = nombre
  }

  if (cambios.telefono !== undefined) cambiosDb.telefono = cambios.telefono
  if (cambios.notas !== undefined) cambiosDb.notas = cambios.notas
  if (cambios.activo !== undefined) cambiosDb.activo = cambios.activo
  if (cambios.salario !== undefined) cambiosDb.salario = cambios.salario

  if (!Object.keys(cambiosDb).length) {
    throw createError({ statusCode: 400, statusMessage: 'No hay cambios que aplicar.' })
  }

  cambiosDb.actualizadoEn = new Date()

  const [fila] = await db
    .update(usuarios)
    .set(cambiosDb)
    .where(eq(usuarios.id, id))
    .returning()

  return serializarUsuario(fila)
}

/**
 * Reset de PIN: guarda el hash nuevo e incrementa `token_version` en la misma
 * escritura. El incremento invalida al instante los JWT emitidos antes.
 */
export async function resetPinAdmin(id: string, pin: string) {
  const [actual] = await db
    .select({ id: usuarios.id, rol: usuarios.rol })
    .from(usuarios)
    .where(eq(usuarios.id, id))
    .limit(1)

  if (!actual) {
    throw createError({ statusCode: 404, statusMessage: 'Usuario no encontrado.' })
  }
  if (actual.rol !== 'jefe' && actual.rol !== 'super_admin') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Solo se puede resetear el PIN de un jefe o de un super administrador.'
    })
  }

  const pinHash = await hashPin(pin)
  const [fila] = await db
    .update(usuarios)
    .set({
      pinHash,
      tokenVersion: sql`${usuarios.tokenVersion} + 1`,
      actualizadoEn: new Date()
    })
    .where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, tokenVersion: usuarios.tokenVersion })

  return fila
}

/** Contadores del tablero de inicio. */
export async function resumenAdmin() {
  const [resumenPuestos] = await db
    .select({
      total: sql<number>`count(*)::int`,
      activos: sql<number>`(count(*) filter (where ${puestos.activo}))::int`,
      centrales: sql<number>`(count(*) filter (where ${puestos.central}))::int`
    })
    .from(puestos)

  const [resumenDispositivos] = await db
    .select({
      total: sql<number>`count(*)::int`,
      revocados: sql<number>`(count(*) filter (where ${dispositivos.revocado}))::int`,
      activos24h: sql<number>`(count(*) filter (where ${dispositivos.ultimaConexionEn} > now() - interval '24 hours'))::int`,
      ultimaSyncOkEn: sql<Date | null>`max(${dispositivos.ultimaSyncOkEn})`
    })
    .from(dispositivos)

  const [resumenFallos] = await db
    .select({
      total: sql<number>`count(*)::int`,
      abiertos: sql<number>`(count(*) filter (where ${syncFallos.resueltoEn} is null))::int`,
      resueltos7d: sql<number>`(count(*) filter (where ${syncFallos.resueltoEn} > now() - interval '7 days'))::int`
    })
    .from(syncFallos)

  return {
    puestos: resumenPuestos ?? { total: 0, activos: 0, centrales: 0 },
    dispositivos: resumenDispositivos ?? { total: 0, revocados: 0, activos24h: 0, ultimaSyncOkEn: null },
    fallos: resumenFallos ?? { total: 0, abiertos: 0, resueltos7d: 0 }
  }
}

/** Fallos de sync con filtros y paginación. Orden: más reciente primero. */
export async function listarFallosAdmin(filtros: FiltrosFallosAdmin) {
  const limit = Math.min(Math.max(filtros.limit ?? 50, 1), MAX_FALLOS)
  const offset = Math.max(filtros.offset ?? 0, 0)

  const condiciones = []
  if (filtros.puestoId) condiciones.push(eq(syncFallos.puestoId, filtros.puestoId))
  if (filtros.dispositivoId) condiciones.push(eq(syncFallos.dispositivoId, filtros.dispositivoId))
  if (filtros.tipo) condiciones.push(eq(syncFallos.tipo, filtros.tipo))
  if (filtros.motivo) condiciones.push(eq(syncFallos.motivo, filtros.motivo))
  if (filtros.tabla) condiciones.push(eq(syncFallos.tabla, filtros.tabla))
  if (filtros.estado === 'abierto') condiciones.push(isNull(syncFallos.resueltoEn))
  if (filtros.estado === 'resuelto') condiciones.push(isNotNull(syncFallos.resueltoEn))

  const where = condiciones.length ? and(...condiciones) : undefined

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(syncFallos)
    .where(where)

  const filas = await db
    .select({
      id: syncFallos.id,
      puestoId: syncFallos.puestoId,
      puestoNombre: puestos.nombre,
      dispositivoId: syncFallos.dispositivoId,
      dispositivoNombre: dispositivos.nombre,
      claveHash: syncFallos.claveHash,
      tipo: syncFallos.tipo,
      fase: syncFallos.fase,
      tabla: syncFallos.tabla,
      registroId: syncFallos.registroId,
      loteId: syncFallos.loteId,
      codigoHttp: syncFallos.codigoHttp,
      motivo: syncFallos.motivo,
      mensaje: syncFallos.mensaje,
      fila: syncFallos.fila,
      contexto: syncFallos.contexto,
      appVersion: syncFallos.appVersion,
      dispositivo: syncFallos.dispositivo,
      intentos: syncFallos.intentos,
      creadoEn: syncFallos.creadoEn,
      ultimoEn: syncFallos.ultimoEn,
      resueltoEn: syncFallos.resueltoEn,
      resueltoPor: syncFallos.resueltoPor,
      nota: syncFallos.nota
    })
    .from(syncFallos)
    .leftJoin(puestos, eq(puestos.id, syncFallos.puestoId))
    .leftJoin(dispositivos, eq(dispositivos.id, syncFallos.dispositivoId))
    .where(where)
    .orderBy(desc(syncFallos.ultimoEn))
    .limit(limit)
    .offset(offset)

  return { fallos: filas, total: totalRow?.total ?? 0, limit, offset }
}

/** Marca un fallo como resuelto o lo reabre. */
export async function resolverFalloAdmin(
  id: string,
  { resuelto, nota }: { resuelto: boolean, nota?: string | null },
  adminId: string
) {
  const [actual] = await db
    .select({ id: syncFallos.id })
    .from(syncFallos)
    .where(eq(syncFallos.id, id))
    .limit(1)

  if (!actual) {
    throw createError({ statusCode: 404, statusMessage: 'Fallo no encontrado.' })
  }

  const cambios: Record<string, any> = {
    resueltoEn: resuelto ? new Date() : null,
    resueltoPor: resuelto ? adminId : null
  }
  if (nota !== undefined) cambios.nota = nota

  const [fila] = await db
    .update(syncFallos)
    .set(cambios)
    .where(eq(syncFallos.id, id))
    .returning()

  return fila
}

/** Dispositivos con su puesto y los últimos usuarios que entraron en ellos. */
export async function listarDispositivosAdmin(filtros: FiltrosDispositivosAdmin) {
  const limit = Math.min(Math.max(filtros.limit ?? 100, 1), MAX_DISPOSITIVOS)
  const offset = Math.max(filtros.offset ?? 0, 0)

  const condiciones = []
  if (filtros.puestoId) condiciones.push(eq(dispositivos.puestoId, filtros.puestoId))
  if (filtros.revocado !== undefined) condiciones.push(eq(dispositivos.revocado, filtros.revocado))
  if (filtros.q) {
    const patron = `%${filtros.q}%`
    condiciones.push(or(
      ilike(dispositivos.nombre, patron),
      ilike(dispositivos.modelo, patron),
      sql`${dispositivos.id}::text ilike ${patron}`
    ))
  }

  const where = condiciones.length ? and(...condiciones) : undefined

  const [totalRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(dispositivos)
    .where(where)

  const filas = await db
    .select({
      id: dispositivos.id,
      puestoId: dispositivos.puestoId,
      puestoNombre: puestos.nombre,
      nombre: dispositivos.nombre,
      modelo: dispositivos.modelo,
      android: dispositivos.android,
      appVersion: dispositivos.appVersion,
      ultimaConexionEn: dispositivos.ultimaConexionEn,
      ultimaSyncOkEn: dispositivos.ultimaSyncOkEn,
      pendientes: dispositivos.pendientes,
      revocado: dispositivos.revocado,
      provisionadoEn: dispositivos.provisionadoEn,
      creadoEn: dispositivos.creadoEn,
      actualizadoEn: dispositivos.actualizadoEn
    })
    .from(dispositivos)
    .leftJoin(puestos, eq(puestos.id, dispositivos.puestoId))
    .where(where)
    .orderBy(sql`${dispositivos.ultimaConexionEn} desc nulls last`)
    .limit(limit)
    .offset(offset)

  const usuariosPorDispositivo = await usuariosRecientes(
    filas.map(fila => fila.id)
  )

  return {
    dispositivos: filas.map(fila => ({
      ...fila,
      usuarios: usuariosPorDispositivo.get(fila.id) ?? []
    })),
    total: totalRow?.total ?? 0,
    limit,
    offset
  }
}

/**
 * Últimos usuarios distintos (máx. 5) por dispositivo, en una sola consulta
 * para todos los equipos de la página.
 */
async function usuariosRecientes(ids: string[]) {
  const salida = new Map<string, { id: string, nombre: string, ultimoAccesoEn: Date | null }[]>()
  if (!ids.length) return salida

  const filas = await db
    .select({
      dispositivoId: accesos.dispositivoId,
      usuarioId: accesos.usuarioId,
      nombre: usuarios.nombre,
      creadoEn: accesos.creadoEn
    })
    .from(accesos)
    .leftJoin(usuarios, eq(usuarios.id, accesos.usuarioId))
    .where(and(
      inArray(accesos.dispositivoId, ids),
      isNotNull(accesos.usuarioId)
    ))
    .orderBy(desc(accesos.creadoEn))

  for (const fila of filas) {
    if (!fila.dispositivoId || !fila.usuarioId) continue
    const lista = salida.get(fila.dispositivoId) ?? []
    if (lista.some(u => u.id === fila.usuarioId)) continue
    if (lista.length >= 5) continue
    lista.push({
      id: fila.usuarioId,
      nombre: fila.nombre ?? '—',
      ultimoAccesoEn: fila.creadoEn
    })
    salida.set(fila.dispositivoId, lista)
  }

  return salida
}

/** Detalle de un dispositivo con su historial reciente de accesos. */
export async function obtenerDispositivoAdmin(id: string) {
  const [fila] = await db
    .select({
      id: dispositivos.id,
      puestoId: dispositivos.puestoId,
      puestoNombre: puestos.nombre,
      nombre: dispositivos.nombre,
      modelo: dispositivos.modelo,
      android: dispositivos.android,
      appVersion: dispositivos.appVersion,
      ultimaConexionEn: dispositivos.ultimaConexionEn,
      ultimaSyncOkEn: dispositivos.ultimaSyncOkEn,
      pendientes: dispositivos.pendientes,
      revocado: dispositivos.revocado,
      provisionadoEn: dispositivos.provisionadoEn,
      creadoEn: dispositivos.creadoEn,
      actualizadoEn: dispositivos.actualizadoEn
    })
    .from(dispositivos)
    .leftJoin(puestos, eq(puestos.id, dispositivos.puestoId))
    .where(eq(dispositivos.id, id))
    .limit(1)

  if (!fila) {
    throw createError({ statusCode: 404, statusMessage: 'Dispositivo no encontrado.' })
  }

  const historial = await db
    .select({
      id: accesos.id,
      tipo: accesos.tipo,
      usuarioId: accesos.usuarioId,
      usuarioNombre: usuarios.nombre,
      appVersion: accesos.appVersion,
      ip: accesos.ip,
      creadoEn: accesos.creadoEn
    })
    .from(accesos)
    .leftJoin(usuarios, eq(usuarios.id, accesos.usuarioId))
    .where(eq(accesos.dispositivoId, id))
    .orderBy(desc(accesos.creadoEn))
    .limit(50)

  return { ...fila, accesos: historial }
}

/** Renombra y/o revoca un dispositivo. Revocar corta la sync en el próximo gate. */
export async function actualizarDispositivoAdmin(
  id: string,
  cambios: { nombre?: string | null, revocado?: boolean }
) {
  const [actual] = await db
    .select({ id: dispositivos.id })
    .from(dispositivos)
    .where(eq(dispositivos.id, id))
    .limit(1)

  if (!actual) {
    throw createError({ statusCode: 404, statusMessage: 'Dispositivo no encontrado.' })
  }

  const cambiosDb: Record<string, any> = { actualizadoEn: new Date() }
  if (cambios.nombre !== undefined) cambiosDb.nombre = cambios.nombre
  if (cambios.revocado !== undefined) cambiosDb.revocado = cambios.revocado

  const [fila] = await db
    .update(dispositivos)
    .set(cambiosDb)
    .where(eq(dispositivos.id, id))
    .returning()

  return fila
}
