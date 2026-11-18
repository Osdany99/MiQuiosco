<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const api = useAdminApi()
const cargando = ref(false)
const errorCarga = ref(null)
const filas = ref([])
const filtroEstado = ref('abierto')
/** Salud del módulo: última telemetría y proofs recientes. */
const resumen = ref(null)

/** Pestaña visible: fallos no reconocidos o dictados que la app entendió. */
const vista = ref('fallos')
const itemsVista = [
  { label: 'Fallos', value: 'fallos', icon: 'i-lucide-mic-off' },
  { label: 'Aciertos', value: 'aciertos', icon: 'i-lucide-check-check' }
]

async function cargarResumen() {
  try {
    resumen.value = await api.resumenVoz()
  } catch {
    resumen.value = null
  }
}

const opcionesEstado = [
  { label: 'Abiertos', value: 'abierto' },
  { label: 'Resueltos', value: 'resuelto' },
  { label: 'Descartados', value: 'descartado' },
  { label: 'Todos', value: 'todos' }
]

const columnas = [
  { accessorKey: 'plantilla', header: 'Plantilla' },
  { accessorKey: 'comando', header: 'Comando' },
  { accessorKey: 'motivo', header: 'Motivo' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'intentos', header: 'Intentos' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'ultimoEn', header: 'Último' },
  { accessorKey: 'acciones', header: '' }
]

function etiquetaEstado(estado) {
  const valor = String(estado ?? 'abierto')
  if (valor === 'resuelto') return 'Resuelto'
  if (valor === 'descartado') return 'Descartado'
  return 'Abierto'
}

function colorEstado(estado) {
  const valor = String(estado ?? 'abierto')
  if (valor === 'resuelto') return 'success'
  if (valor === 'descartado') return 'neutral'
  return 'warning'
}

/**
 * El motivo puede llevar el texto extraído (`producto_no_encontrado: "pan de"`).
 * Se separa para mostrarlo en mono y que el corte se vea de un vistazo.
 */
function partirMotivo(motivo) {
  const texto = String(motivo ?? '')
  const corte = texto.indexOf(': "')
  if (corte < 0 || !texto.endsWith('"')) return { motivoBase: texto, motivoHint: '' }
  return { motivoBase: texto.slice(0, corte), motivoHint: texto.slice(corte + 3, -1) }
}

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    const query = filtroEstado.value === 'todos' ? {} : { estado: filtroEstado.value }
    const eventos = await api.listarEventosVoz(query)
    filas.value = (eventos ?? []).map(f => ({ ...f, ...partirMotivo(f.motivo) }))
    void cargarResumen()
  } catch (e) {
    errorCarga.value = e?.message || 'Error al cargar eventos de voz.'
  } finally {
    cargando.value = false
  }
}

async function marcar(id, estado) {
  try {
    await api.marcarEventoVoz(id, estado)
    toast.add({ title: 'Voz', description: `Marcado como ${estado}.`, color: 'success' })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  }
}

// ------------------------------- Aciertos -------------------------------

const aciertos = ref([])
const cargandoAciertos = ref(false)
const errorAciertos = ref(null)
const filtroComando = ref('todos')
const filtroVentana = ref('7d')
const busquedaTexto = ref('')
const confirmarBorrarAciertos = ref(false)
const borrandoAciertos = ref(false)

/** Comandos conocidos: la lista no se encoge al aplicar un filtro. */
const COMANDOS_VOZ = [
  ['venta_directa', 'Venta'],
  ['venta_fiada', 'Fiado'],
  ['cobro_deuda', 'Cobro'],
  ['deuda_dinero', 'Deuda de dinero'],
  ['transferencia_cuadre', 'Transferencia'],
  ['consulta_stock', 'Stock'],
  ['consulta_precio', 'Precio'],
  ['consulta_deuda', 'Deuda'],
  ['consulta_dia', 'Día'],
  ['consulta_ganancia', 'Ganancia'],
  ['consulta_caja', 'Caja'],
  ['entrada_inventario', 'Entrada'],
  ['cambio_precio', 'Cambio de precio'],
  ['traspaso', 'Traspaso'],
  ['ajuste_inventario', 'Merma/devolución'],
  ['producto_alta', 'Alta de producto'],
  ['cliente_alta', 'Alta de cliente'],
  ['mover_producto', 'Mover producto'],
  ['cuadre_accion', 'Cuadre'],
  ['repetir', 'Repetir'],
  ['ayuda', 'Ayuda']
]

const opcionesComando = [
  { label: 'Todos los comandos', value: 'todos' },
  ...COMANDOS_VOZ.map(([value, label]) => ({ label, value }))
]
const opcionesVentana = [
  { label: 'Últimas 24 h', value: '24h' },
  { label: 'Últimos 7 días', value: '7d' },
  { label: 'Todo', value: 'todo' }
]

const columnasAciertos = [
  { accessorKey: 'texto', header: 'Dictado' },
  { accessorKey: 'comando', header: 'Comando' },
  { accessorKey: 'resultado', header: 'Resultado' },
  { accessorKey: 'detalle', header: 'Detalle' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'confianza', header: 'Conf.' },
  { accessorKey: 'creadoEn', header: 'Fecha' }
]

function porcentaje(confianza) {
  if (confianza == null || !Number.isFinite(Number(confianza))) return '—'
  return `${Math.round(Number(confianza) * 100)}%`
}

function etiquetaComando(comando) {
  return COMANDOS_VOZ.find(([id]) => id === comando)?.[1] ?? comando ?? '—'
}

async function cargarAciertos() {
  cargandoAciertos.value = true
  errorAciertos.value = null
  try {
    const query = { limit: 300 }
    if (filtroComando.value !== 'todos') query.comando = filtroComando.value
    if (filtroVentana.value !== 'todo') query.desde = filtroVentana.value
    const texto = busquedaTexto.value.trim()
    if (texto) query.texto = texto
    aciertos.value = await api.listarAciertosVoz(query)
  } catch (e) {
    errorAciertos.value = e?.message || 'Error al cargar aciertos de voz.'
  } finally {
    cargandoAciertos.value = false
  }
}

async function borrarAciertos() {
  borrandoAciertos.value = true
  try {
    const r = await api.limpiarAciertosVoz()
    confirmarBorrarAciertos.value = false
    toast.add({
      title: 'Aciertos de voz',
      description: `Borrados ${r?.eliminados ?? 0} registros.`,
      color: 'success'
    })
    await cargarAciertos()
  } catch (e) {
    toast.add({ title: 'Aciertos de voz', description: e?.message || 'No se pudo borrar.', color: 'error' })
  } finally {
    borrandoAciertos.value = false
  }
}

watch([filtroComando, filtroVentana], () => {
  if (vista.value === 'aciertos') void cargarAciertos()
})
watch(vista, (valor) => {
  if (valor === 'aciertos') void cargarAciertos()
})
let timerBusqueda = null
watch(busquedaTexto, () => {
  if (vista.value !== 'aciertos') return
  if (timerBusqueda) clearTimeout(timerBusqueda)
  timerBusqueda = setTimeout(() => {
    void cargarAciertos()
  }, 350)
})

onMounted(() => {
  void cargar()
})
watch(filtroEstado, cargar)
</script>

<template>
  <BaseHeaderPage
    title="Comandos de voz"
    description="Fallos que el intérprete no pudo resolver y dictados que la app entendió"
    leading-icon="i-lucide-mic"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">
        {{ vista === 'fallos' ? `${filas.length} eventos` : `${aciertos.length} aciertos` }}
      </span>
      <UButton
        to="/admin/voz-confirmaciones"
        icon="i-lucide-shield-check"
        variant="outline"
        label="Confirmaciones"
      />
    </template>

    <UTabs v-model="vista" :items="itemsVista" class="mb-4 w-full sm:w-80" />

    <!-- ------------------------------ Fallos ------------------------------ -->
    <template v-if="vista === 'fallos'">
      <UAlert
        v-if="errorCarga"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="errorCarga"
      />

      <div v-if="resumen" class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span class="flex items-center gap-1">
          <UIcon name="i-lucide-activity" class="size-4" />
          Último evento: {{ resumen.eventos.ultimoEn ? fmtFechaHora(resumen.eventos.ultimoEn) : 'nunca' }}
        </span>
        <span class="flex items-center gap-1">
          <UIcon name="i-lucide-inbox" class="size-4" />
          {{ resumen.eventos.abiertos }} abiertos de {{ resumen.eventos.total }}
        </span>
        <span class="flex items-center gap-1">
          <UIcon name="i-lucide-shield-check" class="size-4" />
          {{ resumen.confirmaciones.ultimos7d }} confirmaciones en 7 días
          <span v-if="resumen.confirmaciones.ultimaEn">· última {{ fmtFechaHora(resumen.confirmaciones.ultimaEn) }}</span>
        </span>
      </div>

      <BaseTable
        :data="filas"
        :columns="columnas"
        :loading-prop="cargando"
        :show-edit="false"
        :show-delete="false"
        empty-state="No hay eventos de voz que coincidan"
        @reload="cargar"
      >
        <template #toolbar-leading>
          <USelect
            v-model="filtroEstado"
            :items="opcionesEstado"
            size="sm"
            class="w-40"
          />
        </template>

        <template #plantilla-cell="{ row }">
          <span class="font-mono text-xs">{{ row.original.plantilla || '—' }}</span>
          <span v-if="row.original.texto" class="mt-1 flex flex-col gap-0.5">
            <span class="text-[10px] font-semibold uppercase tracking-wide text-warning">
              Texto dictado
            </span>
            <span class="font-mono text-xs">«{{ row.original.texto }}»</span>
          </span>
        </template>

        <template #comando-cell="{ row }">
          {{ row.original.comando }}
        </template>

        <template #motivo-cell="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="text-xs">{{ row.original.motivoBase }}</span>
            <span v-if="row.original.motivoHint" class="font-mono text-xs text-muted">
              «{{ row.original.motivoHint }}»
            </span>
          </div>
        </template>

        <template #puestoNombre-cell="{ row }">
          {{ row.original.puestoNombre || row.original.puestoId || '—' }}
        </template>

        <template #intentos-cell="{ row }">
          <UBadge
            color="neutral"
            variant="soft"
            size="sm"
            :label="String(row.original.intentos)"
          />
        </template>

        <template #estado-cell="{ row }">
          <UBadge
            :color="colorEstado(row.original.estado)"
            variant="soft"
            size="sm"
            :label="etiquetaEstado(row.original.estado)"
          />
        </template>

        <template #ultimoEn-cell="{ row }">
          <span class="text-sm">{{ fmtFechaHora(row.original.ultimoEn) }}</span>
        </template>

        <template #acciones-cell="{ row }">
          <div class="flex flex-wrap justify-end gap-1">
            <UButton
              size="xs"
              color="primary"
              variant="soft"
              icon="i-lucide-list-plus"
              label="Usar plantilla"
              :to="`/admin/voz-lexico?plantilla=${encodeURIComponent(row.original.plantilla || '')}`"
            />
            <UButton
              size="xs"
              color="success"
              variant="soft"
              icon="i-lucide-check"
              label="Resolver"
              @click="marcar(row.original.id, 'resuelto')"
            />
            <UButton
              size="xs"
              color="error"
              variant="soft"
              icon="i-lucide-x"
              label="Descartar"
              @click="marcar(row.original.id, 'descartado')"
            />
            <UButton
              v-if="row.original.estado !== 'abierto'"
              size="xs"
              color="neutral"
              variant="soft"
              icon="i-lucide-rotate-ccw"
              label="Reabrir"
              @click="marcar(row.original.id, 'abierto')"
            />
          </div>
        </template>
      </BaseTable>
    </template>

    <!-- ----------------------------- Aciertos ----------------------------- -->
    <template v-else>
      <UAlert
        color="info"
        variant="soft"
        icon="i-lucide-info"
        title="Diagnóstico temporal"
        description="Una fila por dictado que la app entendió. El texto crudo solo aparece si «Guardar comandos exitosos» está encendido en Configuración. Bórralos cuando termines."
        class="mb-3"
      />

      <UAlert
        v-if="errorAciertos"
        color="error"
        variant="soft"
        icon="i-lucide-alert-circle"
        :title="errorAciertos"
        class="mb-3"
      />

      <BaseTable
        :data="aciertos"
        :columns="columnasAciertos"
        :loading-prop="cargandoAciertos"
        :show-edit="false"
        :show-delete="false"
        empty-state="No hay aciertos que coincidan"
        @reload="cargarAciertos"
      >
        <template #toolbar-leading>
          <div class="flex flex-wrap items-center gap-2">
            <USelect
              v-model="filtroVentana"
              :items="opcionesVentana"
              size="sm"
              class="w-40"
            />
            <USelect
              v-model="filtroComando"
              :items="opcionesComando"
              size="sm"
              class="w-44"
            />
            <UInput
              v-model="busquedaTexto"
              size="sm"
              placeholder="Buscar en el dictado…"
              icon="i-lucide-search"
              class="w-52"
            />
            <UButton
              size="sm"
              color="error"
              variant="outline"
              icon="i-lucide-trash-2"
              label="Borrar todos"
              @click="confirmarBorrarAciertos = true"
            />
          </div>
        </template>

        <template #texto-cell="{ row }">
          <span v-if="row.original.texto" class="font-mono text-xs">«{{ row.original.texto }}»</span>
          <span v-else class="text-xs text-muted">— sin texto —</span>
        </template>

        <template #comando-cell="{ row }">
          <div class="flex flex-col gap-0.5">
            <span class="text-sm">{{ etiquetaComando(row.original.comando) }}</span>
            <span class="font-mono text-[10px] text-muted">{{ row.original.comando }}</span>
          </div>
        </template>

        <template #resultado-cell="{ row }">
          <UBadge
            color="success"
            variant="soft"
            size="sm"
            :label="row.original.resultado"
          />
        </template>

        <template #detalle-cell="{ row }">
          <span class="text-xs">{{ row.original.detalle || '—' }}</span>
        </template>

        <template #puestoNombre-cell="{ row }">
          {{ row.original.puestoNombre || row.original.puestoId || '—' }}
        </template>

        <template #confianza-cell="{ row }">
          <span class="text-xs text-muted">{{ porcentaje(row.original.confianza) }}</span>
        </template>

        <template #creadoEn-cell="{ row }">
          <span class="text-sm">{{ fmtFechaHora(row.original.creadoEn) }}</span>
        </template>
      </BaseTable>
    </template>

    <BaseDialog
      v-model="confirmarBorrarAciertos"
      title="Borrar aciertos de voz"
      description="Se eliminan todos los dictados guardados para diagnóstico."
      confirm-text="Borrar"
      confirm-color="error"
      :loading="borrandoAciertos"
      @confirm="borrarAciertos"
    >
      <p class="text-sm text-muted">
        La operación no se puede deshacer. La captura seguirá activa si el switch
        de Configuración está encendido; apágalo si ya no la necesitas.
      </p>
    </BaseDialog>
  </BaseHeaderPage>
</template>
