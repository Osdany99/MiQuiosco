import { z } from 'zod'

/**
 * Schemas del panel de super administración (Fase 4).
 *
 * El super admin no opera el negocio: solo crea/edita puestos, administra al
 * jefe de cada puesto, revisa dispositivos y fallos de sincronización. Estos
 * schemas son la frontera de esa API (`/api/admin/*`).
 *
 * El PIN nunca viaja al servidor salvo en el alta y en el reset: aquí se valida
 * en claro y el endpoint lo hashea antes de tocar la BD.
 */

const nombre = z.string().trim().min(1, 'El nombre es requerido').max(100, 'Máximo 100 caracteres')
const pin = z
  .string()
  .trim()
  .regex(/^\d{4,6}$/, 'El PIN debe tener entre 4 y 6 dígitos')

const textoOpcional = max =>
  z.string().trim().max(max, `Máximo ${max} caracteres`).nullish()

/**
 * Alta de puesto + su jefe. No hay registro público: el super admin crea
 * ambos de una vez y el cliente descarga el APK y entra con ese usuario.
 */
export const crearPuestoAdminSchema = z.object({
  nombre,
  activo: z.boolean().optional().default(true),
  jefe: z.object({
    nombre,
    pin,
    telefono: textoOpcional(30),
    notas: textoOpcional(500)
  })
})

/** Edición del puesto. `central` no se toca desde el panel. */
export const actualizarPuestoAdminSchema = z
  .object({
    nombre: nombre.optional(),
    activo: z.boolean().optional(),
    /** Reservado para la Fase 7 (permisos por puesto). */
    permisos: z.record(z.string(), z.any()).optional()
  })
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'No hay cambios que aplicar.'
  })

/** Edición del jefe del puesto (el PIN va por su propio endpoint). */
export const actualizarJefeAdminSchema = z
  .object({
    nombre: nombre.optional(),
    telefono: textoOpcional(30),
    notas: textoOpcional(500),
    activo: z.boolean().optional(),
    salario: z.number().min(0, 'El salario no puede ser negativo').nullish()
  })
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'No hay cambios que aplicar.'
  })

/** Reset de PIN. Invalida los tokens abiertos del usuario (tokenVersion). */
export const resetPinAdminSchema = z.object({ pin })

/** Cierre/reapertura de un fallo de sincronización. */
export const resolverFalloAdminSchema = z.object({
  resuelto: z.boolean(),
  nota: textoOpcional(500)
})

/** Renombrar un dispositivo y/o revocarlo (deja de poder sincronizar). */
export const actualizarDispositivoAdminSchema = z
  .object({
    nombre: textoOpcional(80),
    revocado: z.boolean().optional()
  })
  .refine(obj => Object.keys(obj).length > 0, {
    message: 'No hay cambios que aplicar.'
  })
