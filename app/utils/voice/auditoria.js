/**
 * app/utils/voice/auditoria.js — cabeceras para la auditoría de voz (puro).
 *
 * El endpoint `/api/voz/confirmaciones` exige `Authorization: Bearer <jwt>`.
 * Antes se llamaba con `fetch` crudo y `credentials:'include'`, así que el
 * servidor respondía 401 siempre y la tabla `voz_confirmaciones` no se llenaba.
 *
 * Módulo puro (sin Capacitor ni Vue) para poder probarlo con `node --test`.
 */
export function cabecerasDePrueba(token) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
