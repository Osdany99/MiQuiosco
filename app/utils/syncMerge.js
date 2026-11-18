/**
 * mergeFields — fusión campo-a-campo para resolver conflictos de sincronización.
 * Extraído a módulo puro para poder testearlo sin dependencias de Nuxt/Capacitor.
 *
 * `base` (opcional, Fase 10) es la versión conocida del servidor antes de que
 * cualquiera de los dos la editara. Permite hacer 3-way merge:
 *   - cambio solo en cliente → se conserva el cliente (y se marca difiere).
 *   - cambio solo en servidor → se conserva el servidor.
 *   - cambio en ambos y difieren → LWW por timestamp (comportamiento anterior).
 *
 * Sin `base` (APKs viejas o primer sync) cae en el comportamiento previo.
 */
function same(a, b) {
  if (a == null && b == null) return true
  return a === b
}

export function mergeFields(server, client, base = null) {
  const serverTs = server?.actualizadoEn ? new Date(server.actualizadoEn).getTime() : 0
  const clientTs = client?.actualizadoEn ? new Date(client.actualizadoEn).getTime() : 0
  const baseObj = base && typeof base === 'object' ? base : null
  const allKeys = new Set([...Object.keys(server ?? {}), ...Object.keys(client ?? {})])
  const result = {}
  let difiereDelServidor = false

  for (const key of allKeys) {
    if (key === 'id' || key === 'sincronizado') {
      result[key] = key === 'id' ? (server?.id ?? client?.id) : 1
      continue
    }
    const sv = server?.[key]
    const cv = client?.[key]
    const bv = baseObj ? baseObj[key] : undefined

    if (sv === cv) {
      result[key] = sv
      continue
    }

    if (baseObj) {
      const clientChanged = !same(cv, bv)
      const serverChanged = !same(sv, bv)

      if (clientChanged && !serverChanged) {
        result[key] = cv
        difiereDelServidor = true
        continue
      }
      if (serverChanged && !clientChanged) {
        result[key] = sv
        continue
      }
      // ambos cambiaron o ninguno marcó cambio fiable → LWW
    }

    if (sv == null && cv != null) {
      result[key] = cv
      difiereDelServidor = true
    } else if (cv == null && sv != null) {
      result[key] = sv
    } else {
      result[key] = serverTs >= clientTs ? sv : cv
    }
  }
  return { merged: result, difiereDelServidor }
}
