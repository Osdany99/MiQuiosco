/** Comparadores de reintento: el mismo ID con otro efecto no es idempotente. */

export function importeCentavos(valor) {
  return Math.round((Number(valor) || 0) * 100)
}

export function conflictoIdempotente(tipo = 'operación') {
  return Object.assign(
    new Error(`Ese ID ya pertenece a otra ${tipo}. Revisa los datos antes de continuar.`),
    { statusCode: 409, statusMessage: 'El ID de la operación ya se usó con otros datos.' }
  )
}

export function cuentaFiadoCoincide(cuenta, esperado) {
  if (!cuenta) return false
  return cuenta.clienteId === esperado.clienteId
    && (cuenta.cuadreOrigenId ?? null) === (esperado.cuadreOrigenId ?? null)
    && importeCentavos(cuenta.montoTotal) === importeCentavos(esperado.montoTotal)
}

export function pagoFiadoCoincide(pago, esperado) {
  if (!pago) return false
  return pago.cuentaFiadoId === esperado.cuentaFiadoId
    && (pago.cuadreId ?? null) === (esperado.cuadreId ?? null)
    && importeCentavos(pago.monto) === importeCentavos(esperado.monto)
    && (pago.formaPago ?? 'efectivo') === (esperado.formaPago ?? 'efectivo')
}

export function transferenciaCoincide(transferencia, esperado) {
  if (!transferencia) return false
  return transferencia.clienteId === esperado.clienteId
    && transferencia.cuadreId === esperado.cuadreId
    && importeCentavos(transferencia.montoTotal) === importeCentavos(esperado.montoTotal)
}
