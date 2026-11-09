import { normalizar, parseNumberToken } from './gramatica.js'

const PALABRAS_NUMERO = new Set(['mil', 'docena', 'docenas', 'media'])

export function tokenEsNumero(token) {
  const tok = String(token ?? '').trim()
  if (!tok) return false
  if (parseNumberToken(tok) != null) return true
  return PALABRAS_NUMERO.has(tok)
}

export function enmascarar(transcript, { palabrasProducto = new Set(), palabrasCliente = new Set() } = {}) {
  const texto = normalizar(transcript)
  if (!texto) return ''

  const setProductos = palabrasProducto instanceof Set ? palabrasProducto : new Set(palabrasProducto || [])
  const setClientes = palabrasCliente instanceof Set ? palabrasCliente : new Set(palabrasCliente || [])
  const tokens = texto.split(' ').filter(Boolean)
  const salida = []

  for (const token of tokens) {
    let marcado = token
    if (tokenEsNumero(token)) {
      marcado = '<n>'
    } else if (setProductos.has(token)) {
      marcado = '<producto>'
    } else if (setClientes.has(token)) {
      marcado = '<cliente>'
    }
    // Colapso de placeholders consecutivos repetidos.
    if (salida.length && salida[salida.length - 1] === marcado) continue
    salida.push(marcado)
  }

  return salida.join(' ').trim().slice(0, 120).trim()
}
