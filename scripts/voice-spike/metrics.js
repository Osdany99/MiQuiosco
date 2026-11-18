// metrics.js - utilidades de medicion para el spike de voz
// Usado por index.html y/o scripts de exportacion
export function normalize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[.,!?;:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function words(text) {
  return normalize(text).split(' ').filter(Boolean)
}

export function levenshtein(a, b) {
  a = a || ''
  b = b || ''
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let cur = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j] + 1, cur + 1, prev[j - 1] + cost)
      prev[j - 1] = cur
      cur = v
    }
    prev[b.length] = cur
  }
  return prev[b.length]
}

export function wer(reference, hypothesis) {
  const r = words(reference)
  const h = words(hypothesis)
  if (r.length === 0) return h.length === 0 ? 0 : 1
  const d = levenshtein(r.join(' '), h.join(' '))
  return d / r.length
}

export function slotAccuracy(expected, actual) {
  if (expected == null && actual == null) return 1
  if (expected == null || actual == null) return 0
  if (typeof expected === 'number' && typeof actual === 'number') {
    if (expected === 0) return actual === 0 ? 1 : 0
    const diff = Math.abs(expected - actual) / Math.abs(expected)
    return diff <= 0.05 ? 1 : 0
  }
  return normalize(String(expected)) === normalize(String(actual)) ? 1 : 0
}

export function percentile(values, p) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, idx)]
}

export function topMatch(text, catalog) {
  let best = null
  for (const p of catalog) {
    const d = levenshtein(normalize(text), normalize(p.canonicalSpeak))
    if (!best || d < best.distance) best = { product: p, distance: d }
  }
  return best
}

export function toCSV(rows) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map(h => JSON.stringify(r[h] ?? '')).join(','))
  return lines.join('\n')
}
