// Etiquetas de la fase de sincronización para el banner/menú.
// Función pura (sin dependencias): testeable en node.
export function etiquetaFaseSync(fase, progreso = {}) {
  const { actual = 0, total = 0 } = progreso ?? {}
  switch (fase) {
    case 'preparando': return 'Preparando cambios…'
    case 'subiendo': return total > 0 ? `Subiendo ${total} cambio${total === 1 ? '' : 's'}…` : 'Subiendo cambios…'
    case 'bajando': return 'Bajando cambios…'
    case 'aplicando': return total > 0 ? `Aplicando ${actual}/${total}…` : 'Aplicando cambios…'
    default: return ''
  }
}
