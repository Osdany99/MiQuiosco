/**
 * Tipos compartidos entre cliente (SQLite local) y servidor (Postgres).
 *
 * Estos tipos son intencionalmente "agnósticos" del dialecto SQL subyacente,
 * permitiendo que el código del cliente y del servidor manipulen las mismas
 * estructuras sin importar de dónde vienen.
 */

export type Rol = 'jefe' | 'trabajador'
export type EstadoCuadre = 'abierto' | 'cerrado'
export type TipoLinea = 'normal' | 'descuento'
export type AgrupacionPeriodo = 'dia' | 'semana' | 'mes'
export type EstadoCuentaFiado = 'pendiente' | 'parcial' | 'pagada'
export type FormaPagoFiado = 'efectivo' | 'transferencia'

export interface Puesto {
  id: string
  nombre: string
  activo: boolean
  creadoEn: number | string // ms (cliente) o ISO string (servidor)
}

export interface Usuario {
  id: string
  puestoId: string
  nombre: string
  rol: Rol
  pinHash: string
  activo: boolean
  salario: number
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

export interface ProductoCache {
  id: string
  nombre: string
  precioVentaActual: number
  orden: number
  descargadoEn: number
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
  diferencia: number | null
  estado: EstadoCuadre
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
  tipoLinea: TipoLinea
  nota: string | null
  esExtra: boolean
  creadoEn: number | string
  actualizadoEn: number | string
  sincronizado?: boolean
}

export interface RegistroTrabajadorItem {
  id: string
  registroId: string
  productoId: string
  cantidad: number
  precioAnotado: number
  creadoEn: number | string
}

export interface RegistroTrabajador {
  id: string
  fecha: string
  trabajadorId: string
  exportado: boolean
  exportadoEn: number | string | null
  creadoEn: number | string
}

/**
 * Sesión local del jefe/trabajador, almacenada en @capacitor/preferences.
 * Vive solo en el dispositivo, nunca se envía al servidor.
 */
export interface SesionLocal {
  usuario_id: string
  usuario_nombre: string
  rol: 'jefe' | 'trabajador'
  pin_hash_local: string
  /** Solo aplica a trabajador: timestamp UNIX en ms */
  expira_en: number | null
  /** Solo aplica a jefe: timestamp UNIX en ms de la última interacción */
  ultima_actividad_en: number
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
 * Estructura del archivo de exportación del registro del trabajador.
 * Ver spec sección 1.4.
 */
export interface RegistroTrabajadorExport {
  version: 1
  fecha: string
  trabajador_id: string
  trabajador_nombre: string
  items: Array<{
    producto_id: string
    nombre_producto: string
    cantidad: number
    precio_anotado: number
  }>
}

/**
 * Estructura de los payloads de sincronización jefe ↔ servidor.
 */
export interface Cliente {
  id: string
  puestoId: string
  nombre: string
  telefono: string | null
  notas: string | null
  activo: boolean
  creadoEn: number | string
  actualizadoEn: number | string
  sincronizado?: boolean
}

export interface CuentaFiado {
  id: string
  puestoId: string
  clienteId: string
  cuadreOrigenId: string
  montoTotal: number
  montoPagado: number
  estado: EstadoCuentaFiado
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
  formaPago: FormaPagoFiado
  creadoEn: number | string
  sincronizado?: boolean
}

export interface PushPayload {
  productos: Producto[]
  historial_precios: HistorialPrecio[]
  cuadres: Cuadre[]
  cuadre_items: CuadreItem[]
  clientes: Cliente[]
  cuentas_fiado: CuentaFiado[]
  cuentas_fiado_items: CuentaFiadoItem[]
  pagos_fiado: PagoFiado[]
}

export interface PushResponse {
  aceptados: string[]
  conflictos: {
    productos: Producto[]
    historial_precios: HistorialPrecio[]
    cuadres: Cuadre[]
    cuadre_items: CuadreItem[]
    clientes: Cliente[]
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
  clientes: Cliente[]
  cuentas_fiado: CuentaFiado[]
  cuentas_fiado_items: CuentaFiadoItem[]
  pagos_fiado: PagoFiado[]
  timestamp_servidor: number
}

/**
 * Resultado de cálculo de cierre de cuadre.
 */
export interface ResultadoCierreCuadre {
  totalEsperado: number
  totalRealCaja: number
  montoTransferencia: number
  montoFiado: number
  diferencia: number
  tipoResultado: 'exacto' | 'sobrante' | 'faltante'
}
