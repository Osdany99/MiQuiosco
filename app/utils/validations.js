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
  category: z.object({
    name: fields.name('El nombre'),
    description: fields.description()
  }),

  location: z.object({
    name: fields.name('El nombre'),
    typeId: z.string().min(1, 'El tipo es requerido'),
    address: fields.address()
  }),

  role: z.object({
    name: fields.name('El nombre'),
    description: fields.description(),
    isActive: fields.boolean()
  }),

  paymentMethod: z.object({
    name: fields.name('El nombre'),
    description: fields.description(),
    isActive: fields.boolean()
  }),

  user: z.object({
    name: fields.name('El nombre completo'),
    email: fields.email(),
    password: fields.password(false),
    phone: fields.phone(),
    roleId: z.string().optional().nullable(),
    address: fields.address(),
    salary: fields.salary(),
    isActive: fields.boolean(),
    theme: z.string().optional()
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
