/**
 * app/utils/parseEtecsaSms.js - Parser puro de confirmaciones de recarga Etecsa.
 *
 * Sin dependencias (ni Vue ni Capacitor): se prueba con `node --test` contra
 * el corpus real de 191 SMS. El remitente filtra en la capa nativa; aquí el
 * contenido decide si el SMS es una recarga y extrae sus datos.
 *
 * Solo se registran recargas EXITOSAS (decisión del usuario): un mensaje de
 * error falla la regla `tieneNominal AND exito` y devuelve null. Queda en
 * `sms_etecsa` como log crudo para diagnóstico, pero no genera recarga.
 *
 * Reglas validadas contra el corpus (§5 del plan):
 * - 13 recargas parseadas, 0 falsos negativos, 0 IDs duplicados
 * - exactamente 10.00% de ganancia en las 13 (nominal - costo)
 * - teléfonos de 8 (Banco, sin prefijo 53) y 10 dígitos (Monedero)
 * - 3 formatos de ID de transacción: TMW…, MM…/AY…, T26…
 */

/** Remitentes aceptados (normalizados a mayúsculas para comparar). */
export const REMITENTE_MONEDERO = '+5353138610'
export const REMITENTE_BANCO = 'PAGOXMOVIL'

/**
 * Normaliza un teléfono a su forma canónica de 10 dígitos.
 * Banco Metropolitano omite el prefijo `53` (manda 8 dígitos); Monedero manda
 * 10. Sin esto, el mismo cliente no se empareja entre plataformas y su deuda
 * quedaría partida en dos.
 */
export function normalizarTelefono(raw) {
  const digitos = String(raw ?? '').replace(/\D/g, '')
  if (digitos.length === 8) return `53${digitos}`
  return digitos
}

/** `.` es separador decimal, no de miles (`3863.49`, `324.0`). */
export function normalizarMonto(valor) {
  if (valor == null) return null
  const n = Number(String(valor).replace(/,/g, '').replace(/\.$/, '').trim())
  return Number.isFinite(n) ? n : null
}

function plataformaDe(remitente, texto) {
  const r = String(remitente ?? '').trim().toUpperCase()
  if (r === REMITENTE_MONEDERO) return 'monedero'
  if (r === REMITENTE_BANCO) return 'banco'
  // Respaldo por si cambia el remitente pero no el texto.
  if (/monedero\s+mi\s+transfer/i.test(texto)) return 'monedero'
  if (/banco\s+metropolitano/i.test(texto)) return 'banco'
  return null
}

/**
 * Parsea un SMS. Devuelve null si no es una recarga exitosa.
 * @param {{ remitente?: string, cuerpo?: string }} sms
 */
export function parseEtecsaSms(sms) {
  const cuerpo = String(sms?.cuerpo ?? '')
  const remitente = String(sms?.remitente ?? '')
  if (!cuerpo) return null

  // Los cuerpos traen \r\n entre campos: se colapsa a espacios.
  const t = cuerpo.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim()

  // Regla de confirmación: nominal + éxito + teléfono + transacción.
  // `tieneNominal` es el discriminador clave: transferencias y consultas de
  // saldo no lo tienen, y los errores no traen "éxito/completado".
  const exito = /exito|completad[oa]/i.test(t)
  if (!exito) return null

  const telefonoRaw = /telefono:\s*(\d{8,10})/i.exec(t)?.[1]
  if (!telefonoRaw) return null

  const idTransaccion = /(?:id|nro\.?)\s*transacci[oó]n:?\s*([A-Z0-9]{6,})/i.exec(t)?.[1]
  if (!idTransaccion) return null

  // Nominal: "Saldo acreditado" (saldo) ?? "Importe:" (plan de voz/sms/datos).
  const nominalRaw = /saldo\s+acreditado:?\s*([\d.,]+)/i.exec(t)?.[1]
    ?? /importe:?\s*([\d.,]+)/i.exec(t)?.[1]
  const montoNominal = normalizarMonto(nominalRaw)
  if (montoNominal == null) return null

  const costo = normalizarMonto(/(?:monto|importe)\s+pagado:?\s*([\d.,]+)/i.exec(t)?.[1])
  if (costo == null) return null

  const plataforma = plataformaDe(remitente, t)
  if (!plataforma) return null

  const plan = /plan\s+de\s+(voz|sms|datos)\s+de\s+(\d+)\s*(minutos|sms)/i.exec(t)
  const tipo = plan ? plan[1].toLowerCase() : 'saldo'

  const saldoCarteraCup = normalizarMonto(
    /saldo\s+cuenta\s+CUP:?\s*([\d.,]+)/i.exec(t)?.[1]
    ?? /saldo\s+restante:?\s*CR\s*:?\s*([\d.,]+)/i.exec(t)?.[1]
  )
  const saldoCarteraUsd = normalizarMonto(/saldo\s+cuenta\s+USD:?\s*([\d.,]+)/i.exec(t)?.[1])

  return {
    plataforma,
    tipo,
    descripcion: plan ? plan[0] : null,
    unidades: plan ? Number(plan[2]) : null,
    telefono: normalizarTelefono(telefonoRaw),
    telefonoRaw,
    montoNominal,
    costo,
    ganancia: Math.round((montoNominal - costo) * 100) / 100,
    idTransaccion,
    saldoCarteraCup,
    saldoCarteraUsd
  }
}
