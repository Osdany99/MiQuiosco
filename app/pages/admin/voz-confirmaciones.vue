<script setup>
definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const cargando = ref(false)
const errorCarga = ref(null)
const filas = ref([])

const columnas = [
  { accessorKey: 'creadoEn', header: 'Cuándo' },
  { accessorKey: 'puestoNombre', header: 'Puesto' },
  { accessorKey: 'productoNombre', header: 'Producto' },
  { accessorKey: 'cantidad', header: 'Cantidad' },
  { accessorKey: 'ubicacion', header: 'Ubicación' },
  { accessorKey: 'modo', header: 'Modo' },
  { accessorKey: 'outcome', header: 'Resultado' },
  { accessorKey: 'confianza', header: 'Confianza' }
]

function etiquetaOutcome(outcome) {
  const valor = String(outcome ?? 'abandonado')
  if (valor === 'auto-confirmado') return 'Auto-confirmado'
  if (valor === 'cancelado') return 'Cancelado'
  return 'Abandonado'
}

function colorOutcome(outcome) {
  const valor = String(outcome ?? 'abandonado')
  if (valor === 'auto-confirmado') return 'success'
  if (valor === 'cancelado') return 'error'
  return 'warning'
}

async function cargar() {
  cargando.value = true
  errorCarga.value = null
  try {
    filas.value = await $fetch('/api/admin/voz/confirmaciones')
  } catch (e) {
    errorCarga.value = e?.message || 'Error al cargar confirmaciones.'
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)

const porResultado = computed(() => {
  return filas.value.reduce((acc, f) => {
    const k = String(f.outcome ?? 'abandonado')
    acc[k] = (acc[k] || 0) + 1
    return acc
  }, {})
})
</script>

<template>
  <BaseHeaderPage
    title="Confirmaciones del Modo PRO"
    description="Ventas que el Modo PRO intentó autocofirmar sin tocar el dispositivo"
    leading-icon="i-lucide-shield-check"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">{{ filas.length }} registros</span>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Actualizar"
        :loading="cargando"
        @click="cargar"
      />
    </template>

    <div class="flex flex-wrap gap-2 text-sm">
      <span class="text-muted">Resultados:</span>
      <UBadge color="success" variant="soft" label="Auto-confirmados" />
      <span>{{ porResultado['auto-confirmado'] || 0 }}</span>
      <UBadge color="error" variant="soft" label="Cancelados" />
      <span>{{ porResultado.cancelado || 0 }}</span>
      <UBadge color="warning" variant="soft" label="Abandonados" />
      <span>{{ porResultado.abandonado || 0 }}</span>
    </div>

    <UAlert
      v-if="errorCarga"
      color="error"
      variant="soft"
      icon="i-lucide-alert-circle"
      :title="errorCarga"
    />

    <BaseTable
      :data="filas"
      :columns="columnas"
      :loading-prop="cargando"
      :show-edit="false"
      :show-delete="false"
      empty-state="No hay confirmaciones del Modo PRO"
      @reload="cargar"
    >
      <template #creadoEn-cell="{ row }">
        <span class="text-sm">{{ fmtFechaHora(row.original.creadoEn) }}</span>
      </template>

      <template #puestoNombre-cell="{ row }">
        {{ row.original.puestoNombre || row.original.puestoId || '—' }}
      </template>

      <template #productoNombre-cell="{ row }">
        <div class="max-w-48">
          <p class="text-sm font-medium">
            {{ row.original.productoNombre || row.original.productoId || '—' }}
          </p>
        </div>
      </template>

      <template #cantidad-cell="{ row }">
        {{ row.original.cantidad ?? '—' }}
      </template>

      <template #ubicacion-cell="{ row }">
        {{ row.original.ubicacion || '—' }}
      </template>

      <template #modo-cell="{ row }">
        {{ row.original.modo || '—' }}
      </template>

      <template #outcome-cell="{ row }">
        <UBadge
          :color="colorOutcome(row.original.outcome)"
          variant="soft"
          size="sm"
          :label="etiquetaOutcome(row.original.outcome)"
        />
      </template>

      <template #confianza-cell="{ row }">
        <span class="text-xs text-muted">
          {{ row.original.confianza != null ? (Number(row.original.confianza) * 100).toFixed(0) + '%' : '—' }}
        </span>
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
