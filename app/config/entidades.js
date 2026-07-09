import { z } from 'zod'
import { API } from '~/utils/api-routes'

export const ENTIDADES = {
  productos: {
    tabla: 'productos',
    endpoint: API.productos,
    sync: true,
    schema: z.object({
      nombre: fields.name('El nombre del producto'),
      descripcion: fields.description(),
      precioCompraActual: z.coerce.number().min(0, 'No puede ser menor a 0'),
      precioVentaActual: z.coerce.number().min(0, 'No puede ser menor a 0'),
      orden: z.coerce.number().int().min(1, 'Debe ser 1 o más'),
      activo: fields.boolean()
    })
  },
  historial_precios: {
    tabla: 'historial_precios',
    endpoint: null,
    sync: true
  },
  usuarios: {
    tabla: 'usuarios',
    endpoint: API.usuarios,
    sync: true,
    schema: z.object({
      nombre: fields.name(),
      pin: fields.pin().optional(),
      rol: z.enum(['jefe', 'trabajador']),
      salario: fields.number(0).optional(),
      activo: fields.boolean().default(true)
    })
  },
  cuadres: {
    tabla: 'cuadres',
    endpoint: API.cuadres,
    sync: true
  },
  cuadre_items: {
    tabla: 'cuadre_items',
    endpoint: API.itemsCuadre,
    sync: true
  },
  clientes: {
    tabla: 'clientes',
    endpoint: API.clientes,
    sync: true,
    schema: z.object({
      nombre: fields.name('El nombre del cliente'),
      telefono: fields.phone(),
      notas: fields.description(),
      activo: fields.boolean()
    })
  },
  cuentas_fiado: {
    tabla: 'cuentas_fiado',
    endpoint: API.cuentasFiado,
    sync: true
  },
  cuentas_fiado_items: {
    tabla: 'cuentas_fiado_items',
    endpoint: API.itemsCuentaFiado,
    sync: true
  },
  pagos_fiado: {
    tabla: 'pagos_fiado',
    endpoint: API.pagosFiado,
    sync: true
  }
}
