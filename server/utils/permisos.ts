import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { db } from '../database/client'
import { puestos } from '../database/schema'
import { requireAuth } from './auth'
import type { AuthContext } from './auth'
import type { Rol } from '#shared/types'
import { resolverClave } from '#shared/permisos'

/**
 * `undefined` deniega el rol; `null` solo exige autenticación; string exige una
 * clave; string[] permite cualquiera de las alternativas. Así una lectura puede
 * quedar abierta al jefe y limitada a las acciones que la necesitan en worker.
 */
export type ReglaPermisos = Partial<Record<Rol, string | string[] | null>>

export async function exigirPermiso(
  auth: AuthContext,
  claves: string | string[],
  { cualquiera = false } = {}
): Promise<AuthContext> {
  const requeridas = (Array.isArray(claves) ? claves : [claves]).filter(Boolean)
  if (!requeridas.length) return auth

  const [puesto] = await db
    .select({ permisos: puestos.permisos })
    .from(puestos)
    .where(eq(puestos.id, auth.usuario.puestoId))
    .limit(1)
  if (!puesto) {
    throw createError({ statusCode: 403, statusMessage: 'El puesto no está disponible.' })
  }

  const overrides = (puesto.permisos ?? {}) as Record<string, boolean>
  const permitido = cualquiera
    ? requeridas.some(clave => resolverClave(clave, overrides))
    : requeridas.every(clave => resolverClave(clave, overrides))
  if (!permitido) {
    throw createError({
      statusCode: 403,
      statusMessage: 'No tienes permiso para realizar esta operación.'
    })
  }
  return auth
}

const CAMPOS_SENSIBLES_TRABAJADOR = new Set([
  'precioCompra', 'precioCompraActual', 'precioUnitario',
  'costo', 'costoActual', 'costoUnitario', 'costoTotal',
  'ganancia', 'valorizadoQuiosco', 'valorizadoAlmacen', 'salario'
])

/** El trabajador nunca recibe costos/márgenes, aunque el endpoint calcule FIFO. */
export function filtrarCostosTrabajador<T>(auth: AuthContext, valor: T): T {
  if (auth.usuario.rol !== 'trabajador') return valor
  return JSON.parse(JSON.stringify(valor, (key, actual) => (
    CAMPOS_SENSIBLES_TRABAJADOR.has(key) ? undefined : actual
  ))) as T
}

export async function requirePermiso(event: H3Event, reglas: ReglaPermisos): Promise<AuthContext> {
  const auth = await requireAuth(event, 'sync')
  const rol = auth.usuario.rol
  if (!Object.prototype.hasOwnProperty.call(reglas, rol)) {
    throw createError({ statusCode: 403, statusMessage: 'No tienes permiso para realizar esta operación.' })
  }
  const regla = reglas[rol]
  if (regla == null) return auth
  return exigirPermiso(auth, regla, { cualquiera: Array.isArray(regla) })
}
