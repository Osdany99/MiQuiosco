import { z } from 'zod'

export const fields = {
  name: (label = 'El nombre') => z.string().min(1, `${label} es requerido`),
  pin: (label = 'El PIN') => z.string().regex(/^\d{4,6}$/, `${label} debe tener 4-6 dígitos`),
  email: () => z.string().email('Correo inválido').optional().nullable(),
  password: (required = false) => required
    ? z.string().min(6, 'Mínimo 6 caracteres')
    : z.string().min(0).optional(),
  description: () => z.string().optional().nullable(),
  phone: () => z.string().optional().nullable(),
  address: () => z.string().optional().nullable(),
  salary: () => z.number().optional().nullable(),
  number: (min = 0) => z.coerce.number().min(min, `No puede ser menor a ${min}`).optional().nullable(),
  boolean: () => z.boolean().default(true),
  select: (label = 'El campo') => z.string().min(1, `${label} es requerido`)
}

export const schemas = {
  pinReset: z.object({
    pin: fields.pin()
  }),
  user: z.object({
    nombre: fields.name(),
    pin: fields.pin().optional(),
    rol: z.enum(['admin', 'jefe', 'trabajador']),
    activo: fields.boolean().default(true)
  }),

  product: z.object({
    nombre: fields.name('El nombre del producto'),
    descripcion: fields.description(),
    precioCompraActual: z.coerce.number().min(0, 'No puede ser menor a 0'),
    precioVentaActual: z.coerce.number().min(0, 'No puede ser menor a 0'),
    orden: z.coerce.number().int().min(1, 'Debe ser 1 o más'),
    activo: fields.boolean()
  })
}
