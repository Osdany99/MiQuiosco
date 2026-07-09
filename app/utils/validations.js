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
  })
}
