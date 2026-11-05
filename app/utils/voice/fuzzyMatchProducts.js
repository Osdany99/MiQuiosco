function levenshtein(a, b) {
  a = normal(a)
  b = normal(b)
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const v0 = new Array(b.length + 1)
  const v1 = new Array(b.length + 1)
  for (let i = 0; i <= b.length; i++) v0[i] = i
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1
      v1[j + 1] = Math.min(v0[j + 1] + 1, v1[j] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j]
  }
  return v1[b.length]
}

function normal(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()
}

export function fuzzyMatchProducts(productHint, catalog) {
  const target = normal(productHint || '')
  if (!target) return []
  const scored = (catalog || []).map((p) => {
    const variants = [p.name || '', p.canonicalSpeak || ''].filter(Boolean)
    const best = variants.length ? Math.min(...variants.map((v) => levenshtein(target, normal(v)))) : 999
    const score = Math.max(0, 1 - best / Math.max(target.length, 1))
    return { product: p, distance: best, score }
  })
  scored.sort((a, b) => a.distance - b.distance)
  return scored.slice(0, 3)
}