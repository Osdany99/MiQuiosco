/**
 * shared/entities/index.js — Barrel de todas las entities.
 *
 * Importar así:
 *   import { producto, cliente } from '~~/shared/entities'
 *
 * Para iterar sobre todas (e.g. factory offline, sync):
 *   import { ALL_ENTITIES } from '~~/shared/entities'
 */

import { producto } from './producto.js'
import { cliente } from './cliente.js'
import { usuario } from './usuario.js'
import { cuadre } from './cuadre.js'
import { cuadreItem } from './cuadreItem.js'
import { cuentaFiado } from './cuentaFiado.js'
import { cuentaFiadoItem } from './cuentaFiadoItem.js'
import { pagoFiado } from './pagoFiado.js'
import { historialPrecio } from './historialPrecio.js'

export { createEntity } from './_factory.js'
export { buildZodSchema } from './_zod.js'

export { producto }
export { cliente }
export { usuario }
export { cuadre }
export { cuadreItem }
export { cuentaFiado }
export { cuentaFiadoItem }
export { pagoFiado }
export { historialPrecio }

/**
 * ALL_ENTITIES — array de todas las entities registradas.
 * Usado por:
 * - server-offline factory (Fase 4) para generar módulos CRUD
 * - server online factory (Fase 5) para generar endpoints REST
 * - useSync (push/pull) para iterar tablas sincronizables
 */
export const ALL_ENTITIES = [
  producto,
  cliente,
  usuario,
  cuadre,
  cuadreItem,
  cuentaFiado,
  cuentaFiadoItem,
  pagoFiado,
  historialPrecio
]
