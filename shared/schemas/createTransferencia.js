import { z } from 'zod'

const uuidCanonico = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'ID de cliente inválido'
)

export const createTransferenciaSchema = z.object({
  clienteId: uuidCanonico,
  cuadreId: z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'ID de cuadre inválido'
  ),
  monto: z.number().positive('El monto debe ser mayor que cero.')
})
