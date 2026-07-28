/**
 * useCanvas — Comparte lógica de Canvas para componentes de gráficas.
 *
 * @param {Ref<HTMLCanvasElement>} chartCanvas - Ref al elemento canvas
 * @param {Object} props - Props del componente (debe tener data y config)
 * @param {Function} drawChart - Función de dibujo del gráfico
 */
export function useCanvas(chartCanvas, props, drawChart) {
  function initCanvas() {
    if (!chartCanvas.value) return null
    const ctx = chartCanvas.value.getContext('2d')
    if (!ctx) return null
    const canvas = chartCanvas.value
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, rect.width, rect.height)
    return { ctx, rect }
  }

  onMounted(() => drawChart())
  watch(() => props.data, drawChart, { deep: true })
  watch(() => props.config, drawChart, { deep: true })

  return { initCanvas }
}
