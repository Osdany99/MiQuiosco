function normalize(text) {
  return (text || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

const NUM_WORDS = {
  cero: 0,
  un: 1,
  uno: 1,
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
  trece: 13,
  catorce: 14,
  quince: 15,
  veinte: 20,
  treinta: 30
}

function parseNumberToken(tok) {
  if (!tok) return null
  tok = normalize(tok)
  if (/^-?\d+$/.test(tok)) return Number(tok)
  if (Object.prototype.hasOwnProperty.call(NUM_WORDS, tok)) return NUM_WORDS[tok]
  return null
}

export function parseVoiceCommand(transcript) {
  const raw = normalize(transcript || '')
  const result = {
    intent: 'venta_directa',
    transcript: transcript || '',
    draftId: crypto.randomUUID(),
    confidence: estimateConfidence(raw),
    lines: [{ productoHint: '', cantidad: 1, precioUnitario: null, ubicacion: 'quiosco', tipoVenta: 'directa', clienteHint: null }]
  }

  if (!raw) return result

  // Eliminamos intent inicial
  let work = raw.replace(/^(anota|vende|ven|vend)\b/u, '').trim()

  // Ubicación
  const loc = work.match(/\ben\s+(kiosco|quiosco|almacen|almac[eé]n)\b/u)
  if (loc) {
    const value = loc[1].includes('almacen') || loc[1].includes('almac') ? 'almacen' : 'quiosco'
    result.lines[0].ubicacion = value
  }

  // Tipo venta
  if (/\bregalo\b/.test(work)) result.lines[0].tipoVenta = 'regalo'
  else if (/\bcasa\b/.test(work)) result.lines[0].tipoVenta = 'casa'
  else if (/\bfamiliar\b/.test(work)) result.lines[0].tipoVenta = 'familiar'
  else result.lines[0].tipoVenta = 'directa'

  // Precio
  const price = work.match(/\ba\s+precio\s+de\s+(\d+|[a-záéíóúñ]+)\b/u)
  if (price && price[1]) {
    const pricingToken = parseNumberToken(price[1])
    result.lines[0].precioUnitario = pricingToken
  }

  // Cliente hint (don/deña + nombre o últimas 1-2 palabras)
  let customer = null
  const customerMatch
    = work.match(/ (?:a|para)\s+(?:don|doña|señor|señora)\s+([a-záéíóúñ]+)\s*$/u)
      || work.match(/ (?:a|para)\s+([a-záéíóúñ]+)\s*$/u)
  if (customerMatch) {
    customer = normalize(customerMatch[0].replace(/\ba\b|\bpara\b/g, ''))
    // Limpiamos tokens específicos
    work = work.replace(customerMatch[0], '').trim()
    result.lines[0].clienteHint = customer
  }

  // Limpiamos marcadores
  work = work
    .replace(/\ben\s+(kiosco|quiosco|almacen|almac[eé]n)\b/giu, '')
    .replace(/\b(normal|regalo|casa|familiar)\b/giu, '')
    .replace(/\ba\s+precio\s+de\s+(?:\d+|[a-záéíóúñ]+)\b/giu, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Cantidad (primer token)
  const tokens = work.split(' ')
  if (tokens.length > 0) {
    const qty = parseNumberToken(tokens[0])
    if (qty !== null) {
      result.lines[0].cantidad = qty
      work = tokens.slice(1).join(' ').trim()
    } else {
      // "un", "una", "unos" inferir 1
      if (/^(un|una|unos|unas)\b/.test(work)) {
        result.lines[0].cantidad = 1
        work = work.replace(/^(un|una|unos|unas)\s+/, '').trim()
      }
    }
  }

  // Producto hint residual
  result.lines[0].productoHint = work.trim()

  // no vacío
  if (!result.lines[0].productoHint) result.lines[0].productoHint = ''
  return result
}

function estimateConfidence(text) {
  if (!text) return 0
  // Heurística normalizada sin STT engine confidence (Web Speech lo puede sobreescribir)
  const words = text.split(/\s+/).filter(Boolean).length
  let score = 0.6
  if (words >= 3) score += 0.1
  if (words <= 6) score += 0.1
  if (/\d/.test(text)) score += 0.05
  return Math.min(0.92, score)
}
