export const API = {
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    cambiarPinInicial: '/api/auth/cambiar-pin-inicial'
  },
  usuarios: {
    list: '/api/usuarios',
    byId: id => `/api/usuarios/${id}`,
    resetPin: id => `/api/usuarios/${id}/pin`
  },
  productos: {
    list: '/api/productos',
    byId: id => `/api/productos/${id}`,
    historialPrecios: id => `/api/productos/${id}/historial-precios`
  },
  sync: {
    productosActivos: '/api/sync/productos-activos',
    push: '/api/sync/push',
    pull: desde => `/api/sync/pull?desde=${desde}`
  },
  cuadres: {
    list: '/api/cuadres',
    byId: id => `/api/cuadres/${id}`
  },
  itemsCuadre: {
    list: '/api/items-cuadre',
    byId: id => `/api/items-cuadre/${id}`
  },
  graficas: {
    productosMasVendidos: '/api/graficas/productos-mas-vendidos',
    productosMayorGanancia: '/api/graficas/productos-mayor-ganancia',
    productosMenorRotacion: '/api/graficas/productos-menor-rotacion',
    evolucionProducto: id => `/api/graficas/evolucion-producto/${id}`,
    precioUsadoVsOficial: id => `/api/graficas/precio-usado-vs-oficial/${id}`,
    gananciaPorPeriodo: '/api/graficas/ganancia-por-periodo',
    ingresosPorPeriodo: '/api/graficas/ingresos-por-periodo',
    regalosDescuentosPorPeriodo: '/api/graficas/regalos-descuentos-por-periodo',
    proporcionFormasPago: '/api/graficas/proporcion-formas-pago',
    estadoCuadres: '/api/graficas/estado-cuadres',
    faltantesSobrantesAcumulados: '/api/graficas/faltantes-sobrantes-acumulados',
    cuadresReabiertos: '/api/graficas/cuadres-reabiertos',
    pagosTrabajadores: '/api/graficas/pagos-trabajadores',
    comparativaPorTrabajador: '/api/graficas/comparativa-por-trabajador'
  }
}
