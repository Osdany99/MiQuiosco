<template>
  <BaseDialog
    v-model="isOpen"
    :title="`Detalle del lote${nombre ? ` · ${nombre}` : ''}`"
    description="Resumen de la compra y de todo lo que salió de este lote."
    cancel-text="Cerrar"
    hide-confirm
    :ui="{ content: 'sm:max-w-6xl' }"
    @cancel="isOpen = false"
  >
    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted" />
    </div>

    <UAlert
      v-else-if="error"
      icon="i-lucide-alert-triangle"
      color="error"
      variant="soft"
      title="No se pudo cargar el detalle"
      :description="error"
    />

    <div v-else-if="desglose" class="space-y-4">
      <!-- Ficha de la compra -->
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-elevated/50 px-3 py-2 text-sm">
        <span class="font-medium">{{ loteInfo.nombreProducto ?? '—' }}</span>
        <span class="text-muted">Entrada: {{ loteInfo.fechaEntrada ? fmtDate(loteInfo.fechaEntrada) : '—' }}</span>
        <span v-if="loteInfo.proveedor" class="text-muted">Proveedor: {{ loteInfo.proveedor }}</span>
        <UBadge
          v-if="loteInfo.anulado"
          color="error"
          variant="soft"
          size="sm"
          label="Anulado"
        />
      </div>

      <p
        v-if="loteInfo.detalleCompra || loteInfo.notas"
        class="text-xs text-muted"
      >
        {{ [loteInfo.detalleCompra, loteInfo.notas].filter(Boolean).join(' · ') }}
      </p>

      <UTabs v-model="tabActiva" :items="tabs" class="w-full" />

      <!-- ---------- Resumen ---------- -->
      <div v-if="tabActiva === 'resumen'" class="space-y-4">
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Compra
            </p>
            <p class="text-lg font-semibold">
              {{ resumen.unidadesEntrada }} u.
            </p>
            <p class="text-xs text-muted">
              {{ fmtPrecio(loteInfo.valorCompra) }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              En stock
            </p>
            <p class="text-lg font-semibold">
              {{ resumen.unidadesEnStock }} u.
            </p>
            <p class="text-xs text-muted">
              {{ fmtPrecio(valorEnStock) }}
              <span class="block">Alm {{ saldos.almacen }} · Quiosco {{ saldos.quiosco }}</span>
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Vendido
            </p>
            <p class="text-lg font-semibold">
              {{ resumen.unidadesVendidas }} u.
            </p>
            <p class="text-xs text-muted">
              {{ fmtPrecio(resumen.ingresoVentas) }} cobrados · costo {{ fmtPrecio(resumen.costoVentas) }}
            </p>
          </div>
          <div class="rounded-md border border-default p-3">
            <p class="text-xs text-muted">
              Resultado del lote
            </p>
            <p class="text-lg font-semibold" :class="colorGanancia(resumen.resultado)">
              {{ fmtPrecio(resumen.resultado) }}
            </p>
            <p class="text-xs text-muted">
              Ventas {{ fmtPrecio(resumen.gananciaVentas) }}
            </p>
          </div>
        </div>

        <div
          v-if="resumen.porCobrar > 0 || resumen.ingresoCobrado !== resumen.ingresoVentas"
          class="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <div class="rounded-md bg-elevated/50 p-3">
            <p class="text-xs text-muted">
              Ingreso cobrado
            </p>
            <p class="text-base font-semibold">
              {{ fmtPrecio(resumen.ingresoCobrado) }}
            </p>
          </div>
          <div v-if="resumen.porCobrar > 0" class="rounded-md bg-elevated/50 p-3">
            <p class="text-xs text-muted">
              Fiado por cobrar
            </p>
            <p class="text-base font-semibold text-warning">
              {{ fmtPrecio(resumen.porCobrar) }}
            </p>
          </div>
          <div class="rounded-md bg-elevated/50 p-3">
            <p class="text-xs text-muted">
              Pérdidas
            </p>
            <p class="text-base font-semibold text-error">
              {{ fmtPrecio(resumen.perdidaRegalo + resumen.perdidaMerma) }}
            </p>
            <p class="text-xs text-muted">
              Regalos {{ fmtPrecio(resumen.perdidaRegalo) }} · mermas {{ fmtPrecio(resumen.perdidaMerma) }}
            </p>
          </div>
        </div>

        <div v-if="tiposConDatos.length" class="space-y-2">
          <p class="text-sm font-medium">
            Desglose por tipo de salida
          </p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              v-for="tipo in tiposConDatos"
              :key="tipo.value"
              type="button"
              class="rounded-md border border-default p-3 text-left transition hover:bg-elevated/50"
              @click="tabActiva = tipo.value"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-1.5 text-sm font-medium">
                  <UIcon :name="tipo.icon" class="size-4 text-muted" />
                  {{ tipo.label }}
                </span>
                <UBadge
                  color="neutral"
                  variant="soft"
                  size="sm"
                  :label="`${tipo.cantidad} u.`"
                />
              </div>
              <p class="mt-1 text-xs text-muted">
                {{ tipo.lineas }} salida{{ tipo.lineas === 1 ? '' : 's' }}
                <template v-if="tipo.value !== 'regalo' && tipo.value !== 'merma'">
                  · {{ fmtPrecio(tipo.ingreso) }}
                </template>
              </p>
              <p class="text-xs font-medium" :class="colorGanancia(tipo.ganancia)">
                <template v-if="tipo.value === 'regalo' || tipo.value === 'merma'">
                  Costo {{ fmtPrecio(-tipo.ganancia) }}
                </template>
                <template v-else>
                  Ganancia {{ fmtPrecio(tipo.ganancia) }}
                </template>
              </p>
              <p v-if="tipo.value === 'fiado' && tipo.porCobrar > 0" class="text-xs text-warning">
                Por cobrar {{ fmtPrecio(tipo.porCobrar) }}
              </p>
            </button>
          </div>
        </div>

        <p v-else class="text-sm text-muted">
          De este lote todavía no ha salido mercancía.
        </p>
      </div>

      <!-- ---------- Pestaña de un tipo de salida ---------- -->
      <template v-else>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <UBadge
            color="neutral"
            variant="soft"
            size="sm"
            :label="`${filasActivas.length} salida${filasActivas.length === 1 ? '' : 's'}`"
          />
          <TableToolbar
            v-model:visible-headers="visiblesActivas"
            :column-headers="columnHeadersActivas"
          />
        </div>

        <div class="overflow-x-auto">
          <UTable
            :data="filasActivas"
            :columns="columnasActivas"
            :ui="{ td: 'px-2 py-1.5 whitespace-nowrap', th: 'px-2 py-1.5' }"
            empty="Sin salidas de este tipo"
          >
            <template #precio-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.precio) }}</span>
            </template>
            <template #subtotal-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.subtotal) }}</span>
            </template>
            <template #costo-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.costo) }}</span>
            </template>
            <template #costoUnitario-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.costoUnitario) }}</span>
            </template>
            <template #cobrado-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.cobrado) }}</span>
            </template>
            <template #porCobrar-cell="{ row }">
              <span class="font-mono" :class="row.original.porCobrar > 0 ? 'text-warning' : ''">
                {{ fmtPrecio(row.original.porCobrar) }}
              </span>
            </template>
            <template #ganancia-cell="{ row }">
              <span class="font-mono font-medium" :class="colorGanancia(row.original.ganancia)">
                {{ fmtPrecio(row.original.ganancia) }}
              </span>
            </template>
            <template #cliente-cell="{ row }">
              <span class="block max-w-40 truncate">{{ row.original.cliente || '—' }}</span>
            </template>
            <template #categoria-cell="{ row }">
              <UBadge
                :color="colorCategoria(row.original.categoria)"
                variant="soft"
                size="sm"
                :label="etiquetaCategoria(row.original.categoria)"
              />
            </template>
            <template #estado-cell="{ row }">
              <UBadge
                :color="colorEstadoFiado(row.original.estado)"
                variant="soft"
                size="sm"
                :label="etiquetaEstadoFiado(row.original.estado)"
              />
            </template>
            <template #ubicacion-cell="{ row }">
              <UBadge
                color="neutral"
                variant="soft"
                size="sm"
                :icon="row.original.ubicacion === 'quiosco' ? 'i-lucide-store' : 'i-lucide-warehouse'"
                :label="row.original.ubicacion === 'quiosco' ? 'Quiosco' : 'Almacén'"
              />
            </template>
            <template #usuario-cell="{ row }">
              {{ row.original.usuario || '—' }}
            </template>
            <template #nota-cell="{ row }">
              <span class="block max-w-48 truncate text-muted">{{ row.original.nota || '—' }}</span>
            </template>
            <template #motivo-cell="{ row }">
              <span class="block max-w-48 truncate">{{ row.original.motivo || '—' }}</span>
            </template>
          </UTable>
        </div>
      </template>
    </div>
  </BaseDialog>
</template>

<script setup>
/**
 * DialogoLote — Detalle de una compra concreta.
 *
 * No calcula nada: el resumen y las filas por tipo de salida vienen de
 * `useInventario.cargarDesgloseLote`, que en online y offline usan la MISMA
 * función pura (shared/inventario/desglose.js). Así el desglose no puede
 * cambiar de número según haya conexión.
 *
 * La primera pestaña es el resumen (compra, stock, resultado y pérdidas) y
 * después aparece una pestaña por cada tipo de salida que tenga filas.
 */
const props = defineProps({
  /** Fila del historial de compras: solo se usa su id y el nombre. */
  lote: { type: Object, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })

const inv = useInventario()

const cargando = ref(false)
const error = ref(null)
const desglose = ref(null)
const tabActiva = ref('resumen')

const TIPOS = [
  { value: 'quiosco', label: 'Quiosco', icon: 'i-lucide-store' },
  { value: 'directa', label: 'Venta directa', icon: 'i-lucide-pocket' },
  { value: 'casa', label: 'Venta casa', icon: 'i-lucide-house' },
  { value: 'familiar', label: 'Venta familiar', icon: 'i-lucide-users' },
  { value: 'regalo', label: 'Regalos', icon: 'i-lucide-gift' },
  { value: 'fiado', label: 'Fiado', icon: 'i-lucide-hand-coins' },
  { value: 'merma', label: 'Mermas', icon: 'i-lucide-wrench' }
]

const nombre = computed(() => props.lote?.nombreProducto ?? '')

const loteInfo = computed(() => desglose.value?.lote ?? {})
const saldos = computed(() => desglose.value?.saldos ?? { almacen: 0, quiosco: 0 })
const resumen = computed(() => desglose.value?.resumen ?? {})
const filas = computed(() => desglose.value?.filas ?? {})

const valorEnStock = computed(() =>
  Math.round(
    ((Number(saldos.value.valorAlmacen) || 0) + (Number(saldos.value.valorQuiosco) || 0)) * 100
  ) / 100
)

/** Tipos con al menos una salida, para las cards y las pestañas. */
const tiposConDatos = computed(() =>
  TIPOS.map((tipo) => {
    const lista = filas.value[tipo.value] ?? []
    const total = resumen.value[tipo.value] ?? {}
    return {
      ...tipo,
      lineas: lista.length,
      cantidad: total.unidades ?? lista.reduce((s, f) => s + (Number(f.cantidad) || 0), 0),
      ingreso: total.ingreso ?? 0,
      ganancia: total.ganancia ?? 0,
      porCobrar: total.porCobrar ?? 0
    }
  }).filter(t => t.lineas > 0)
)

const tabs = computed(() => [
  { label: 'Resumen', value: 'resumen', icon: 'i-lucide-chart-pie' },
  ...tiposConDatos.value.map(t => ({
    label: `${t.label} (${t.lineas})`,
    value: t.value,
    icon: t.icon
  }))
])

// ---------- Columnas por pestaña ----------
const COLUMNAS = {
  fecha: { accessorKey: 'fecha', header: 'Fecha' },
  hora: { accessorKey: 'hora', header: 'Hora' },
  cantidad: { accessorKey: 'cantidad', header: 'Cant.' },
  cliente: { accessorKey: 'cliente', header: 'Cliente' },
  precio: { accessorKey: 'precio', header: 'Precio' },
  subtotal: { accessorKey: 'subtotal', header: 'Subtotal' },
  ganancia: { accessorKey: 'ganancia', header: 'Ganancia' },
  costoUnitario: { accessorKey: 'costoUnitario', header: 'Costo unit.' },
  costo: { accessorKey: 'costo', header: 'Costo' },
  categoria: { accessorKey: 'categoria', header: 'Categoría' },
  ubicacion: { accessorKey: 'ubicacion', header: 'Ubicación' },
  usuario: { accessorKey: 'usuario', header: 'Usuario' },
  nota: { accessorKey: 'nota', header: 'Nota' },
  estado: { accessorKey: 'estado', header: 'Estado' },
  cobrado: { accessorKey: 'cobrado', header: 'Cobrado' },
  porCobrar: { accessorKey: 'porCobrar', header: 'Por cobrar' },
  motivo: { accessorKey: 'motivo', header: 'Motivo' }
}

const COLUMNAS_POR_TIPO = {
  quiosco: ['fecha', 'hora', 'cantidad', 'cliente', 'precio', 'subtotal', 'ganancia', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  directa: ['fecha', 'hora', 'cantidad', 'cliente', 'precio', 'subtotal', 'ganancia', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  casa: ['fecha', 'hora', 'cantidad', 'cliente', 'precio', 'subtotal', 'ganancia', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  familiar: ['fecha', 'hora', 'cantidad', 'cliente', 'precio', 'subtotal', 'ganancia', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  regalo: ['fecha', 'hora', 'cantidad', 'cliente', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  fiado: ['fecha', 'hora', 'cantidad', 'cliente', 'precio', 'subtotal', 'ganancia', 'estado', 'cobrado', 'porCobrar', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota'],
  merma: ['fecha', 'hora', 'cantidad', 'motivo', 'costoUnitario', 'costo', 'categoria', 'ubicacion', 'usuario', 'nota']
}

const POR_DEFECTO = {
  quiosco: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Precio', 'Subtotal', 'Ganancia'],
  directa: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Precio', 'Subtotal', 'Ganancia'],
  casa: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Precio', 'Subtotal', 'Ganancia'],
  familiar: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Precio', 'Subtotal', 'Ganancia'],
  regalo: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Costo unit.', 'Costo'],
  fiado: ['Fecha', 'Hora', 'Cant.', 'Cliente', 'Precio', 'Subtotal', 'Ganancia', 'Estado', 'Por cobrar'],
  merma: ['Fecha', 'Hora', 'Cant.', 'Motivo', 'Costo unit.', 'Costo']
}

/** Headers visibles por pestaña; se reinician al abrir cada lote. */
const visibles = ref({})

const visiblesActivas = computed({
  get: () => visibles.value[tabActiva.value] ?? [],
  set: (v) => {
    visibles.value = { ...visibles.value, [tabActiva.value]: v }
  }
})

const columnasActivas = computed(() =>
  (COLUMNAS_POR_TIPO[tabActiva.value] ?? []).map(k => COLUMNAS[k])
)

const columnHeadersActivas = computed(() =>
  columnasActivas.value.map(c => c.header)
)

/** Las filas ya traen fecha/hora en ms; se formatean una vez. */
const filasActivas = computed(() =>
  (filas.value[tabActiva.value] ?? []).map(f => ({
    ...f,
    fecha: f.fechaMs ? fmtDate(f.fechaMs) : '—',
    hora: f.horaMs ? fmtHora(f.horaMs) : '—'
  }))
)

// ---------- Textos y colores ----------
function fmtHora(ms) {
  if (ms == null) return '—'
  return new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function colorGanancia(v) {
  const n = Number(v) || 0
  if (n > 0) return 'text-success'
  if (n < 0) return 'text-error'
  return 'text-muted'
}

const ETIQUETA_CATEGORIA = {
  normal: 'Normal',
  aCosto: 'A costo',
  menor: 'Bajo costo',
  regalo: 'Regalo',
  familiar: 'Familiar',
  casa: 'Casa',
  merma: 'Merma'
}

const COLOR_CATEGORIA = {
  normal: 'success',
  aCosto: 'neutral',
  menor: 'error',
  regalo: 'warning',
  familiar: 'info',
  casa: 'primary',
  merma: 'error'
}

const etiquetaCategoria = c => ETIQUETA_CATEGORIA[c] ?? (c || '—')
const colorCategoria = c => COLOR_CATEGORIA[c] ?? 'neutral'

const etiquetaEstadoFiado = e =>
  e === 'pagada' ? 'Pagada' : e === 'parcial' ? 'Parcial' : 'Pendiente'
const colorEstadoFiado = e => colorEstadoDeuda(e)

// ---------- Carga ----------
async function cargar() {
  if (!props.lote?.id) return
  cargando.value = true
  error.value = null
  desglose.value = null
  tabActiva.value = 'resumen'
  try {
    const data = await inv.cargarDesgloseLote(props.lote.id)
    desglose.value = data
    // Defaults de columnas solo para las pestañas que existen.
    const nuevos = {}
    for (const tipo of TIPOS) {
      if ((data?.filas?.[tipo.value] ?? []).length > 0) {
        nuevos[tipo.value] = [...(POR_DEFECTO[tipo.value] ?? [])]
      }
    }
    visibles.value = nuevos
  } catch (e) {
    error.value = e?.data?.statusMessage ?? e?.message ?? 'Error desconocido'
  } finally {
    cargando.value = false
  }
}

watch(isOpen, (open) => {
  if (open) cargar()
  else {
    desglose.value = null
    error.value = null
  }
})

// Si una pestaña desaparece (dato recargado), no dejar el tab apuntando a ella.
watch(tabs, (lista) => {
  if (!lista.some(t => t.value === tabActiva.value)) tabActiva.value = 'resumen'
})
</script>
