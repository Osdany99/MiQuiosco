/* eslint-disable @stylistic/max-statements-per-line */
export const PERMISOS_VERSION = 1
export const GRUPOS = ['Ventas', 'Inventario', 'Catálogo', 'Clientes', 'Administración', 'Datos sensibles']
export const VISTAS = [
  { key: 'cuadre', label: 'Cuadre del día', icon: 'i-lucide-clipboard-check', ruta: '/cuadre', grupo: 'Ventas', defecto: true, obligatorio: true, acciones: [{ key: 'cerrar', label: 'Cerrar cuadre', defecto: true }, { key: 'reabrir', label: 'Reabrir cuadre', defecto: true }, { key: 'fiar', label: 'Crear fiado', defecto: true }, { key: 'transferencia', label: 'Registrar transferencia', defecto: true }, { key: 'pago_trabajador', label: 'Pagar a trabajador', defecto: true }] },
  { key: 'cuadres', label: 'Historial de cuadres', icon: 'i-lucide-clock', ruta: '/cuadres', grupo: 'Ventas', defecto: true, acciones: [{ key: 'reabrir', label: 'Reabrir cuadre', defecto: true }] },
  { key: 'historial-quiosco', label: 'Historial del quiosco', icon: 'i-lucide-store', ruta: '/historial-quiosco', grupo: 'Ventas', defecto: true, acciones: [] },
  { key: 'salidas', label: 'Salidas fuera de cuadre', icon: 'i-lucide-receipt', ruta: '/venta-directa', grupo: 'Ventas', defecto: true, acciones: [] },
  { key: 'deudas', label: 'Deudas', icon: 'i-lucide-hand-coins', ruta: '/deudas', grupo: 'Ventas', defecto: true, acciones: [{ key: 'cobrar', label: 'Cobrar', defecto: true }, { key: 'ver_pagos', label: 'Ver pagos', defecto: true }] },
  { key: 'recargas', label: 'Recargas', icon: 'i-lucide-smartphone-charging', ruta: '/recargas', grupo: 'Ventas', defecto: true, acciones: [{ key: 'cobrar', label: 'Cobrar', defecto: true }, { key: 'asignar_cliente', label: 'Asignar cliente', defecto: true }, { key: 'crear_cliente', label: 'Crear cliente', defecto: true }] },
  { key: 'recargas-sms', label: 'Por confirmar (SMS)', icon: 'i-lucide-message-square-text', ruta: '/recargas/sms', padre: 'recargas', grupo: 'Ventas', defecto: true, acciones: [{ key: 'barrer', label: 'Barrer buzón', defecto: true }, { key: 'anadir', label: 'Añadir al historial', defecto: true }, { key: 'asignar_cliente', label: 'Asignar cliente', defecto: true }] },
  { key: 'graficas', label: 'Gráficas', icon: 'i-lucide-bar-chart-2', ruta: '/graficas', grupo: 'Ventas', defecto: true, acciones: [{ key: 'seccion_ganancia', label: 'Sección Ganancia', defecto: true }, { key: 'seccion_inventario', label: 'Sección Inventario', defecto: true }, { key: 'seccion_ventas', label: 'Sección Ventas', defecto: true }, { key: 'seccion_deudas', label: 'Sección Deudas', defecto: true }, { key: 'seccion_recargas', label: 'Sección Recargas', defecto: true }] },
  { key: 'quiosco', label: 'Quiosco', icon: 'i-lucide-store', ruta: '/quiosco', grupo: 'Inventario', defecto: true, acciones: [{ key: 'vender', label: 'Vender', defecto: true }, { key: 'traspaso', label: 'Reponer', defecto: true }, { key: 'ajuste', label: 'Merma / devolución', defecto: true }, { key: 'ver_lotes', label: 'Ver lotes', defecto: true }, { key: 'voz', label: 'Vender por voz', defecto: true }] },
  { key: 'almacen', label: 'Almacén', icon: 'i-lucide-warehouse', ruta: '/almacen', grupo: 'Inventario', defecto: true, acciones: [{ key: 'entrada', label: 'Añadir lote', defecto: true }, { key: 'vender', label: 'Vender', defecto: true }, { key: 'traspaso', label: 'Traspasar', defecto: true }, { key: 'ajuste', label: 'Merma', defecto: true }, { key: 'ver_lotes', label: 'Ver lotes', defecto: true }, { key: 'corregir_lote', label: 'Corregir lote', defecto: true }, { key: 'voz', label: 'Vender por voz', defecto: true }] },
  { key: 'productos', label: 'Productos', icon: 'i-lucide-package', ruta: '/productos', grupo: 'Catálogo', defecto: true, acciones: [{ key: 'crear', label: 'Crear', defecto: true }, { key: 'editar', label: 'Editar', defecto: true }, { key: 'activar', label: 'Activar/Desactivar', defecto: true }, { key: 'precio', label: 'Cambiar precio', defecto: true }, { key: 'reordenar', label: 'Reordenar', defecto: true }, { key: 'historial', label: 'Historial de precios', defecto: true }] },
  { key: 'proveedores', label: 'Proveedores', icon: 'i-lucide-truck', ruta: '/proveedores', grupo: 'Catálogo', defecto: false, acciones: [{ key: 'crear', label: 'Crear', defecto: false }, { key: 'editar', label: 'Editar', defecto: false }, { key: 'eliminar', label: 'Eliminar', defecto: false }] },
  { key: 'clientes', label: 'Clientes', icon: 'i-lucide-users', ruta: '/clientes', grupo: 'Clientes', defecto: true, acciones: [{ key: 'crear', label: 'Crear', defecto: true }, { key: 'editar', label: 'Editar', defecto: true }, { key: 'fusionar', label: 'Fusionar', defecto: true }, { key: 'importar', label: 'Importar contactos', defecto: true }, { key: 'telefonos', label: 'Gestionar teléfonos', defecto: true }] },
  { key: 'ficha-cliente', label: 'Ficha del cliente', icon: 'i-lucide-user-search', ruta: '/ficha-cliente', grupo: 'Clientes', defecto: true, acciones: [] },
  { key: 'usuarios', label: 'Usuarios', icon: 'i-lucide-user-cog', ruta: '/usuarios', grupo: 'Administración', defecto: true, acciones: [{ key: 'crear', label: 'Crear', defecto: true }, { key: 'editar', label: 'Editar', defecto: true }, { key: 'eliminar', label: 'Eliminar', defecto: true }, { key: 'reset_pin', label: 'Resetear PIN', defecto: true }, { key: 'activar', label: 'Activar/Desactivar', defecto: true }] },
  { key: 'venta.contado', label: 'Venta contado', icon: 'i-lucide-pocket', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true },
  { key: 'venta.fiado', label: 'Venta fiado', icon: 'i-lucide-hand-coins', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true },
  { key: 'venta.casa', label: 'Venta casa', icon: 'i-lucide-house', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true },
  { key: 'venta.familiar', label: 'Venta familiar', icon: 'i-lucide-users', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true },
  { key: 'venta.regalo', label: 'Regalo', icon: 'i-lucide-gift', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true },
  { key: 'venta.voz', label: 'Vender por voz', icon: 'i-lucide-mic', ruta: null, grupo: 'Inventario', defecto: true, acciones: [], virtual: true }
]
export const DATOS = [{ key: 'ver_costos', label: 'Ver costos y stock valorizado', defecto: true }, { key: 'ver_ganancias', label: 'Ver ganancias y márgenes', defecto: true }, { key: 'ver_salarios', label: 'Ver salarios y pagos', defecto: true }]

export function claveVista(v) { return `vistas.${v}` }
export function claveAccion(v, a) { return `acciones.${v}.${a}` }
export function claveDato(d) { return `datos.${d}` }
export function claveVenta(m) { return `venta.${m}` }
export const VISTAS_CON_RUTA = VISTAS.filter(v => v.ruta)

export function vistaDeRuta(ruta) {
  if (!ruta) return null
  const r = String(ruta).split('?')[0].replace(/\/+$/, '') || '/'
  if (r === '/inventario') return 'almacen'
  if (r === '/recargas/sms') return 'recargas-sms'
  const ex = VISTAS.find(v => v.ruta && v.ruta.split('?')[0] === r)
  if (ex) return ex.key
  const pa = VISTAS.find(v => v.ruta && r.startsWith(v.ruta.split('?')[0] + '/'))
  return pa ? pa.key : null
}

export function defectoDeClave(clave) {
  const c = String(clave)
  if (c.startsWith('vistas.')) { const key = c.slice('vistas.'.length); const v = VISTAS.find(x => x.key === key); return v ? v.defecto !== false : true }
  if (c.startsWith('acciones.')) { const resto = c.slice('acciones.'.length); const partes = resto.split('.'); const vistaKey = partes[0]; const accionKey = partes.slice(1).join('.'); const v = VISTAS.find(x => x.key === vistaKey); if (!v) return true; const a = (v.acciones || []).find(x => x.key === accionKey); return a ? a.defecto !== false : true }
  if (c.startsWith('datos.')) { const key = c.slice('datos.'.length); const d = DATOS.find(x => x.key === key); return d ? d.defecto !== false : true }
  if (c.startsWith('venta.')) { const mod = c.slice('venta.'.length); const v = VISTAS.find(x => x.key === `venta.${mod}`); return v ? v.defecto !== false : true }
  return true
}

export function todasLasClaves() {
  const out = []
  for (const v of VISTAS) { out.push(claveVista(v.key)); for (const a of v.acciones || [])out.push(claveAccion(v.key, a.key)) }
  for (const d of DATOS) out.push(claveDato(d.key))
  for (const v of VISTAS.filter(x => x.virtual)) out.push(v.key)
  return out
}

const CLAVES_VALIDAS = new Set(todasLasClaves())
export function esClaveValida(clave) { return CLAVES_VALIDAS.has(String(clave)) }
export function normalizarOverrides(input) {
  const out = {}
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out
  for (const [k, v] of Object.entries(input)) { if (typeof v !== 'boolean') continue; if (!esClaveValida(k)) continue; out[k] = v }
  return out
}
export function esObligatoria(vistaKey) { const v = VISTAS.find(x => x.key === vistaKey); return !!v?.obligatorio }
export function resolverClave(clave, overrides) {
  const ov = (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) ? overrides : {}
  const c = String(clave)
  if (c.startsWith('acciones.')) { const vistaKey = c.slice('acciones.'.length).split('.')[0]; const viewOn = resolverClave(claveVista(vistaKey), ov); if (!viewOn) return false }
  if (Object.prototype.hasOwnProperty.call(ov, c)) return !!ov[c]
  return defectoDeClave(c)
}
export function estadoCompleto(overrides) {
  const ov = (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) ? overrides : {}
  const out = {}
  for (const k of todasLasClaves()) out[k] = resolverClave(k, ov)
  return out
}
export function estadoAOverrides(estado) {
  const out = {}
  for (const k of todasLasClaves()) { const def = defectoDeClave(k); if (estado[k] !== def)out[k] = !!estado[k] }
  return out
}
export function vistasPorGrupo() {
  const map = {}
  for (const v of VISTAS) { if (!map[v.grupo])map[v.grupo] = []; map[v.grupo].push(v) }
  return map
}
export function resumenRestricciones(overrides) {
  const est = estadoCompleto(overrides)
  let vistasOff = 0, accionesOff = 0
  for (const k of todasLasClaves()) { if (est[k]) continue; if (k.startsWith('vistas.'))vistasOff++; else if (k.startsWith('acciones.') || k.startsWith('venta.'))accionesOff++ }
  return { vistasOff, accionesOff }
}
