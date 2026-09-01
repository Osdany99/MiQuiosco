/**
 * mergeFields — fusión campo-a-campo para resolver conflictos de sincronización.
 * Extraído a módulo puro para poder testearlo sin dependencias de Nuxt/Capacitor.
 */
export function mergeFields(server, client) {
  const serverTs = server.actualizadoEn ? new Date(server.actualizadoEn).getTime() : 0
  const clientTs = client.actualizadoEn ? new Date(client.actualizadoEn).getTime() : 0
  const allKeys = new Set([...Object.keys(server), ...Object.keys(client)])
  const result = {}
  let difiereDelServidor = false

  for (const key of allKeys) {
    if (key === 'id' || key === 'sincronizado') {
      result[key] = key === 'id' ? server.id : 1
      continue
    }
    const sv = server[key]
    const cv = client[key]
    if (sv === cv) {
      result[key] = sv
    } else if (sv == null && cv != null) {
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
