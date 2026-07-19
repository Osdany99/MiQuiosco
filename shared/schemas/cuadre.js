import { z } from 'zod'

export const cuadreSchema = z.object({
  puestoId: z.string().nullable().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD)'),
  jefeId: z.string().nullable().optional(),
  trabajadorTurnoId: z.string().nullable().optional(),
  pagoTrabajador: z.number().min(0, 'El pago no puede ser negativo').nullable().optional(),
  totalEsperado: z.number().min(0, 'El total no puede ser negativo').default(0),
  totalRealCaja: z.number().min(0, 'El total no puede ser negativo').nullable().optional(),
  montoTransferencia: z.number().min(0, 'El monto no puede ser negativo').default(0),
  montoFiado: z.number().min(0, 'El monto no puede ser negativo').default(0),
  montoCobradoFiado: z.number().min(0, 'El monto no puede ser negativo').default(0),
  diferencia: z.number().nullable().optional(),
  estado: z.enum(['abierto', 'cerrado'], { message: 'Estado inválido' }).default('abierto'),
  notas: z.string().nullable().optional(),
  cerradoEn: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato de fecha inválido').transform(s => new Date(s)).nullable().optional(),
  reabiertoVeces: z.number().int().min(0, 'El valor no puede ser negativo').default(0),
  ultimaReaperturaEn: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Formato de fecha inválido').transform(s => new Date(s)).nullable().optional()
})
