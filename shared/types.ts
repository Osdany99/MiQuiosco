/**
 * Tipos compartidos entre cliente (SQLite local) y servidor (Postgres).
 *
 * Estos tipos son intencionalmente "agnósticos" del dialecto SQL subyacente,
 * permitiendo que el código del cliente y del servidor manipulen las mismas
 * estructuras sin importar de dónde vienen.
 */

export type Rol = 'jefe' | 'trabajador' | 'cliente'

export interface Usuario {
  id: string
  puestoId: string
  nombre: string
  telefono: string | null
  notas: string | null
  rol: Rol
  pinHash: string
  activo: boolean
  salario: number | null
  creadoEn: number | string
  actualizadoEn: number | string
}

export interface Producto {
  id: string
  puestoId: string
  nombre: string
  descripcion: string | null
  activo: boolean
  orden: number
  precioCompraActual: number
  precioVentaActual: number
  creadoEn: number | string
  actualizadoEn: number | string
  /**
   * Solo presente en la representación local del cliente.
   * En el servidor es siempre true (todo está sincronizado).
   */
  sincronizado?: boolean
}

export interface HistorialPrecio {
  id: string
  productoId: string
  precioCompra: number
  precioVenta: number
  vigenteDesde: number | string
  vigenteHasta: number | string | null
  cambiadoPor: string | null
  creadoEn: number | string
}

export interface Cuadre {
  id: string
  puestoId: string
  fecha: string // YYYY-MM-DD
  jefeId: string
  trabajadorTurnoId: string | null
  pagoTrabajador: number | null
  totalEsperado: number
  totalRealCaja: number | null
  montoTransferencia: number
  montoFiado: number
  montoCobradoFiado: number
  diferencia: number | null
  estado: 'abierto' | 'cerrado'
  notas: string | null
  cerradoEn: number | string | null
  reabiertoVeces: number
  ultimaReaperturaEn: number | string | null
  creadoEn: number | string
  actualizadoEn: number | string
  sincronizado?: boolean
}

export interface CuadreItem {
  id: string
  cuadreId: string
  productoId: string
  precioVentaUsado: number
  cantidad: number
  subtotal: number
  tipoLinea: 'normal' | 'descuento'
  nota: string | null
  esExtra: boolean
  creadoEn: number | string
  actualizadoEn: number | string
  sincronizado?: boolean
}

/**
 * Payload de autenticación en respuestas de login.
 */
export interface LoginResponse {
  token?: string
  usuario?: {
    id: string
    nombre: string
    rol: Rol
    puestoId: string
  }
  expiraEn?: number
}

/**
 * Estructura de los payloads de sincronización jefe ↔ servidor.
 */
export interface CuentaFiado {
  id: string
  puestoId: string
  clienteId: string
  cuadreOrigenId: string
  montoTotal: number
  montoPagado: number
  estado: 'pendiente' | 'parcial' | 'pagada'
  creadoEn: number | string
  actualizadoEn: number | string
  sincronizado?: boolean
}

export interface CuentaFiadoItem {
  id: string
  cuentaFiadoId: string
  productoId: string
  cantidad: number
  precioVentaUsado: number
  subtotal: number
  creadoEn: number | string
  sincronizado?: boolean
}

export interface PagoFiado {
  id: string
  cuentaFiadoId: string
  cuadreId: string
  monto: number
  formaPago: 'efectivo' | 'transferencia'
  creadoEn: number | string
  sincronizado?: boolean
}

export interface PushResponse {
  aceptados: string[]
  conflictos: {
    productos: Producto[]
    historial_precios: HistorialPrecio[]
    cuadres: Cuadre[]
    cuadre_items: CuadreItem[]
    usuarios: Usuario[]
    cuentas_fiado: CuentaFiado[]
    cuentas_fiado_items: CuentaFiadoItem[]
    pagos_fiado: PagoFiado[]
  }
}

export interface PullResponse {
  productos: Producto[]
  historial_precios: HistorialPrecio[]
  cuadres: Cuadre[]
  cuadre_items: CuadreItem[]
  usuarios: Usuario[]
  cuentas_fiado: CuentaFiado[]
  cuentas_fiado_items: CuentaFiadoItem[]
  pagos_fiado: PagoFiado[]
  timestamp_servidor: number
}
