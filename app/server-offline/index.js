/**
 * server-offline/index.js — Dispatch centralizado de las operaciones offline.
 *
 * Los módulos CRUD por tabla se generan con createOfflineModule(config, overrides).
 * Cada módulo expone: { list, get, create, update, patch, remove, ...actions }.
 */
import { createOfflineModule } from './api/_factory.js'
import { createProductoMut, updateProductoMut } from '../../shared/mutations/producto'
import { useDb } from './db/client'
import { hashPin } from './utils/auth.js'
import { TABLES } from '../../shared/tables.js'

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
    config: { tabla: 'productos', defaults: { precioCompraActual: 0, precioVentaActual: 0, orden: 0, activo: true }, puestoScoped: TABLES.productos.puestoScoped, customMutations: { create: createProductoMut, update: updateProductoMut } },
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
    config: { tabla: 'usuarios', defaults: { rol: 'trabajador', salario: 600, activo: true }, puestoScoped: TABLES.usuarios.puestoScoped },
    overrides: {
      requireRole: 'jefe',
      beforeCreate: async (datos) => {
        const { pin, ...resto } = datos
        return { ...resto, pinHash: await hashPin(pin) }
      },
      beforeUpdate: async (cambios, auth) => {
        // Guard: último jefe no puede quitarse el rol/desactivarse
        const esAutocambio = auth?.usuarioActual?.value?.id && cambios && (cambios.rol != null || cambios.activo === false)
        if (esAutocambio) {
          const authId = auth?.usuarioActual?.value?.id
          const intentaQuitarJefe = cambios.rol != null && cambios.rol !== 'jefe'
          const intentaDesactivar = cambios.activo === false
          if (intentaQuitarJefe || intentaDesactivar) {
            const db = useDb()
            const target = await db.getById('usuarios', authId)
            if (target?.rol === 'jefe') {
              const todos = await db.queryAll('usuarios')
              const otrosJefes = todos.filter(u => u.rol === 'jefe' && u.activo && u.id !== authId)
              if (otrosJefes.length === 0) {
                throw new Error('No puedes quitarte el rol de jefe o desactivarte si eres el último jefe activo.')
              }
            }
          }
        }
        if (!cambios.pin) return cambios
        const { pin, ...resto } = cambios
        return { ...resto, pinHash: await hashPin(pin) }
      },
      beforeRemove: async (id) => {
        const db = useDb()
        const target = await db.getById('usuarios', id)
        if (target?.rol === 'jefe') {
          const todos = await db.queryAll('usuarios')
          const otrosJefes = todos.filter(u => u.rol === 'jefe' && u.activo && u.id !== id)
          if (otrosJefes.length === 0) {
            throw new Error('No puedes eliminar al último jefe activo.')
          }
        }
      },
      serialize: serializarUsuario,
      actions: {
        resetPin: (id, datos, auth) => getModulo('usuarios').patch(id, { pin: datos.pin }, auth)
      }
    }
  },
  {
    config: { tabla: 'cuadres', defaults: { totalEsperado: 0, montoTransferencia: 0, montoFiado: 0, montoCobradoFiado: 0, estado: 'abierto', reabiertoVeces: 0 }, puestoScoped: TABLES.cuadres.puestoScoped },
    overrides: {
      beforeCreate: async (datos, auth) => {
        const db = useDb()
        const all = await db.queryAll('cuadres')
        const duplicado = all.find(c =>
          c.puestoId === datos.puestoId && c.fecha === datos.fecha
        )
        if (duplicado) {
          throw new Error('Ya existe un cuadre para este puesto en la fecha de hoy.')
        }
        return {
          ...datos,
          jefeId: datos.jefeId ?? auth?.usuarioActual?.value?.id ?? null
        }
      },
      listFilter: (opts, row) => !opts.fecha || row.fecha === opts.fecha
    }
  },
  {
    config: { tabla: 'cuadre_items', defaults: { precioVentaUsado: 0, cantidad: 0, subtotal: 0, tipoLinea: 'normal', esExtra: false } },
    overrides: {}
  },
  {
    config: { tabla: 'cuentas_fiado', defaults: { montoTotal: 0, montoPagado: 0, estado: 'pendiente' }, puestoScoped: TABLES.cuentas_fiado.puestoScoped },
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
    config: { tabla: 'transferencias', defaults: { montoTotal: 0 }, puestoScoped: TABLES.transferencias.puestoScoped },
    overrides: {}
  },
  {
    config: { tabla: 'transferencia_items', defaults: {} },
    overrides: {}
  },
  {
    config: { tabla: 'ajustes', defaults: { cantidad: 0, monto: 0 }, puestoScoped: TABLES.ajustes.puestoScoped },
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
