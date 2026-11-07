/**
 * hashFila — huella estable de una fila para detectar drift de sincronización.
 *
 * No incluye marcas de sincronización (`sincronizado`, `hash_contenido`,
 * `actualizadoEn`, `creadoEn`): sin ellas, un pull del servidor y una edición
 * local con el mismo contenido arrojan el mismo hash aunque sus timestamps o
 * flags difieran. Sí incluye `id` y el resto de columnas de negocio.
 */
const IGNORADOS = new Set([
  'sincronizado',
  'hashContenido',
  'hash_contenido',
  'actualizadoEn',
  'actualizado_en',
  'creadoEn',
  'creado_en',
  'actualizadoen',
  'creadoen'
])

function normalizar(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (Array.isArray(v)) return v.map(normalizar)
  if (typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = normalizar(v[k])
    return out
  }
  // Normaliza booleans que viajan como 0/1 en SQLite.
  if (v === 0 || v === 1) return v
  return String(v)
}

function canonico(row) {
  const out = {}
  for (const key of Object.keys(row ?? {}).sort()) {
    if (IGNORADOS.has(key)) continue
    const norm = normalizar(row[key])
    if (norm !== undefined) out[key] = norm
  }
  return JSON.stringify(out)
}

export async function calcularHashFila(row) {
  try {
    if (typeof crypto === 'undefined' || !crypto?.subtle) return null
    const buf = new TextEncoder().encode(canonico(row))
    const dig = await crypto.subtle.digest('SHA-256', buf)
    return Array.from(new Uint8Array(dig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

export function canonicoFila(row) {
  return canonico(row)
}
