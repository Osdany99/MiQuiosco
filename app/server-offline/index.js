/**
 * server-offline/index.js — Dispatch centralizado de las operaciones offline.
 *
 * Los módulos CRUD por tabla YA NO se escriben a mano: se generan con
 * `createOfflineModule(entity, overrides)` iterando sobre ALL_ENTITIES.
 * Añadir una entity nueva a shared/entities la habilita aquí automáticamente;
 * sólo hay que declarar overrides si tiene particularidades offline-only
 * (rol requerido, hash de PIN, acciones custom, etc.).
 *
 * Cada módulo expone: { list, get, create, update, patch, remove, ...actions }.
 */
import { ALL_ENTITIES } from '../../shared/entities/index.js'
import { createOfflineModule } from './api/_factory.js'
import { useDb } from './db/client.js'
import { hashPin } from './utils/auth.js'

/**
 * Serializa un usuario ocultando pinHash y normalizando salario a número.
 * Espejo de la forma que devolvían usuarios/{list,create,update}.js.
 */
function serializarUsuario(u) {
  if (!u) return u
  return {
    id: u.id,
    nombre: u.nombre,
    rol: u.rol,
    activo: u.activo,
    salario: Number(u.salario),
    puestoId: u.puestoId,
    creadoEn: u.creadoEn,
    actualizadoEn: u.actualizadoEn
  }
}

/**
 * Overrides offline-only por entity (clave = entity.key). Sólo las entities
 * con particularidades aparecen aquí; el resto usa el módulo genérico.
 */
const OVERRIDES_POR_KEY = {
  usuario: {
    requireRole: 'jefe',
    // El form envía `pin` en claro; se persiste hasheado como pinHash.
    beforeCreate: async (datos) => {
      const { pin, ...resto } = datos
      return { ...resto, pinHash: await hashPin(pin) }
    },
    beforeUpdate: async (cambios) => {
      if (!cambios.pin) return cambios
      const { pin, ...resto } = cambios
      return { ...resto, pinHash: await hashPin(pin) }
    },
    serialize: serializarUsuario,
    actions: {
      // resetPin(id, { pin }, auth) — espejo de usuarios/[id]/pin.patch.ts
      resetPin: (id, datos, auth) => getModulo('usuarios').patch(id, { pin: datos.pin }, auth)
    }
  },

  producto: {
    actions: {
      // getHistorial(productoId) — historial de precios ordenado desc por vigenteDesde.
      getHistorial: async (productoId) => {
        const db = useDb()
        const all = await db.queryAll('historial_precios')
        return all
          .filter(h => h.productoId === productoId)
          .sort((a, b) => (b.vigenteDesde ?? 0) - (a.vigenteDesde ?? 0))
      }
    }
  },

  cuadre: {
    // El jefeId es el usuario actual (no viene en el payload del form).
    beforeCreate: (datos, auth) => ({
      ...datos,
      jefeId: datos.jefeId ?? auth?.usuarioActual?.value?.id ?? null
    }),
    // Filtro opcional por fecha al listar (opts.fecha).
    listFilter: (opts, row) => !opts.fecha || row.fecha === opts.fecha
  }
}

/**
 * Registro tabla → módulo, generado a partir de ALL_ENTITIES.
 * Sólo las entities sincronizables (con tabla propia) obtienen módulo.
 */
const MODULOS_POR_TABLA = {}
for (const entity of ALL_ENTITIES) {
  MODULOS_POR_TABLA[entity.tabla] = createOfflineModule(
    entity,
    OVERRIDES_POR_KEY[entity.key] ?? {}
  )
}

/**
 * Retorna el módulo de operaciones para la tabla indicada, o null
 * si la tabla no tiene un módulo dedicado.
 * @param {string} tabla — nombre de tabla (snake_case)
 * @returns {object|null}
 */
export function getModulo(tabla) {
  return MODULOS_POR_TABLA[tabla] ?? null
}
