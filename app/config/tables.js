const endpoint = segment => ({
  list: `/api/${segment}`,
  byId: id => `/api/${segment}/${id}`
})

export const productos = {
  tabla: 'productos', endpoints: endpoint('productos'), puestoScoped: true,
  label: { singular: 'Producto', plural: 'Productos', gender: 'm' }
}

export const usuarios = {
  tabla: 'usuarios', endpoints: endpoint('usuarios'), puestoScoped: true,
  label: { singular: 'Usuario', plural: 'Usuarios', gender: 'm' }
}

export const clientes = {
  tabla: 'clientes', endpoints: endpoint('clientes'), puestoScoped: true,
  label: { singular: 'Cliente', plural: 'Clientes', gender: 'm' }
}

export const cuadres = {
  tabla: 'cuadres', endpoints: endpoint('cuadres'), puestoScoped: true,
  label: { singular: 'Cuadre', plural: 'Cuadres', gender: 'm' }
}

export const cuadre_items = {
  tabla: 'cuadre_items', endpoints: endpoint('cuadre-items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' }
}

export const cuentas_fiado = {
  tabla: 'cuentas_fiado', endpoints: endpoint('cuentas-fiado'), puestoScoped: true,
  label: { singular: 'Cuenta', plural: 'Cuentas', gender: 'f' }
}

export const cuentas_fiado_items = {
  tabla: 'cuentas_fiado_items', endpoints: endpoint('cuentas_fiado_items'),
  label: { singular: 'Línea', plural: 'Líneas', gender: 'f' }
}

export const pagos_fiado = {
  tabla: 'pagos_fiado', endpoints: endpoint('pagos-fiado'),
  label: { singular: 'Pago', plural: 'Pagos', gender: 'm' }
}

export const historial_precios = {
  tabla: 'historial_precios', endpoints: endpoint('historial_precios'),
  label: { singular: 'Precio', plural: 'Precios', gender: 'm' }
}

export const TABLES = {
  productos, usuarios, clientes, cuadres, cuadre_items,
  cuentas_fiado, cuentas_fiado_items, pagos_fiado, historial_precios
}
