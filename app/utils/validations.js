import { z } from 'zod'

export const fields = {
  name: (label = 'El nombre') => z.string().min(1, `${label} es requerido`),
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
  user: z.object({
    name: fields.name('El nombre'),
    pin: z.string().length(4, 'El PIN debe tener 4 dígitos'),
    rol: z.enum(['admin', 'jefe', 'trabajador']),
    activo: fields.boolean().default(true)
  }),

  product: z.object({
    name: fields.name('El nombre del producto'),
    description: fields.description(),
    costPrice: fields.number(0),
    salePrice: fields.number(0),
    categoryId: z.string().min(1, 'La categoría es requerida'),
    isActive: fields.boolean()
  })
}
