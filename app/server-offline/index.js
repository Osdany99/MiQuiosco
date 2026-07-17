/**
 * server-offline/index.js — Dispatch centralizado de las operaciones offline.
 *
 * Los módulos CRUD por tabla se generan con createOfflineModule(config, overrides).
 * Cada módulo expone: { list, get, create, update, patch, remove, ...actions }.
 */
import { createOfflineModule } from './api/_factory.js'
import { createProductoMut, updateProductoMut } from '~~/shared/mutations/producto.js'
import { useDb } from './db/client.js'
import { hashPin } from './utils/auth.js'

function serializarUsuario(u) {
  if (!u) return u
  return {
    id: u.id,
    nombre: u.nombre,
    telefono: u.telefono,
    notas: u.notas,
    rol: u.rol,
    activo: u.activo,
    salario: u.salario != null ? Number(u.salario) : null,
    puestoId: u.puestoId,
    creadoEn: u.creadoEn,
    actualizadoEn: u.actualizadoEn
  }
}

const OFFLINE_CONFIGS = [
  {
    config: { tabla: 'productos', defaults: { precioCompraActual: 0, precioVentaActual: 0, orden: 0, activo: true }, puestoScoped: true, customMutations: { create: createProductoMut, update: updateProductoMut } },
    overrides: {
      actions: {
        getHistorial: async (productoId) => {
          const db = useDb()
          const all = await db.queryAll('historial_precios')
          return all
            .filter(h => h.productoId === productoId)
            .sort((a, b) => (b.vigenteDesde ?? 0) - (a.vigenteDesde ?? 0))
        }
      }
    }
  },
  {
    config: { tabla: 'usuarios', defaults: { rol: 'trabajador', salario: 600, activo: true }, puestoScoped: true },
    overrides: {
      requireRole: 'jefe',
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
        resetPin: (id, datos, auth) => getModulo('usuarios').patch(id, { pin: datos.pin }, auth)
      }
    }
  },
  {
    config: { tabla: 'cuadres', defaults: { totalEsperado: 0, montoTransferencia: 0, montoFiado: 0, montoCobradoFiado: 0, estado: 'abierto', reabiertoVeces: 0 }, puestoScoped: true },
    overrides: {
      beforeCreate: (datos, auth) => ({
        ...datos,
        jefeId: datos.jefeId ?? auth?.usuarioActual?.value?.id ?? null
      }),
      listFilter: (opts, row) => !opts.fecha || row.fecha === opts.fecha
    }
  },
  {
    config: { tabla: 'cuadre_items', defaults: { precioVentaUsado: 0, cantidad: 0, subtotal: 0, tipoLinea: 'normal', esExtra: false } },
    overrides: {}
  },
  {
    config: { tabla: 'cuentas_fiado', defaults: { montoTotal: 0, montoPagado: 0, estado: 'pendiente' }, puestoScoped: true },
    overrides: {}
  },
  {
    config: { tabla: 'cuentas_fiado_items', defaults: {} },
    overrides: {}
  },
  {
    config: { tabla: 'pagos_fiado', defaults: {} },
    overrides: {}
  },
  {
    config: { tabla: 'historial_precios', defaults: {} },
    overrides: {}
  }
]

const MODULOS_POR_TABLA = {}
for (const { config, overrides } of OFFLINE_CONFIGS) {
  MODULOS_POR_TABLA[config.tabla] = createOfflineModule(config, overrides)
}

export function getModulo(tabla) {
  return MODULOS_POR_TABLA[tabla] ?? null
}
