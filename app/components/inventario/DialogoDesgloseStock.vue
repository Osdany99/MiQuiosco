<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  productoId: { type: String, default: null },
  ubicacion: { type: String, default: 'quiosco' },
  nombreProducto: { type: String, default: '' },
  stockTotal: { type: Number, default: 0 }
})

const isOpen = defineModel({ type: Boolean, default: false })
const inv = useInventario()
const lotes = ref([])
const cargando = ref(false)

const fmt = n => Number(n || 0).toLocaleString('es-MX')

async function cargar() {
  if (!props.productoId) return
  cargando.value = true
  try {
    const ls = await inv.lotesConStock(props.productoId, props.ubicacion)
    lotes.value = (ls ?? []).sort((a, b) => {
      return Number(a?.creadoEn ?? 0) - Number(b?.creadoEn ?? 0)
    })
  } catch {
    lotes.value = []
  } finally {
    cargando.value = false
  }
}

watch(isOpen, (open) => {
  if (open) void cargar()
  else lotes.value = []
})

const estadoDeLote = (lote) => {
  return lote?.estadoLote || 'normal'
}

const badgeColor = (estado) => {
  switch (estado) {
    case 'defectuoso':
      return 'error'
    case 'liquidacion':
      return 'warning'
    case 'vencimiento_proximo':
      return 'warning'
    case 'obsoleto':
      return 'neutral'
    default:
      return 'neutral'
  }
}

const badgeTexto = (estado) => {
  switch (estado) {
    case 'defectuoso':
      return 'defectuoso'
    case 'liquidacion':
      return 'liquidacion'
    case 'vencimiento_proximo':
      return 'vencimiento proximo'
    default:
      return 'normal'
  }
}

// El cambio de estado vive en "editar lote" (DialogoCorreccionLote), no aquí.
</script>

<template>
  <BaseDialog
    v-model="isOpen"
    title="Desglose de stock"
    :description="`${nombreProducto || 'Producto'} - ${fmt(stockTotal)} en ${ubicacion}`"
    cancel-text="Cerrar"
    hide-confirm
    @cancel="isOpen = false"
  >
    <div class="space-y-3">
      <div v-if="cargando" class="flex justify-center py-6">
        <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted-foreground" />
      </div>
      <UAlert
        v-else-if="!lotes.length"
        color="neutral"
        variant="soft"
        icon="i-lucide-inbox"
        title="No hay lotes con saldo para este producto."
        description="No hay stock trazable en esta ubicacion."
      />
      <div v-else class="space-y-2">
        <div
          v-for="(lote, idx) in lotes"
          :key="lote.id"
          class="flex items-center justify-between gap-3 rounded-md border border-gray-200/70 px-3 py-2 dark:border-slate-700"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ lote.fechaEntrada || 'Sin fecha' }}</span>
              <UBadge
                size="xs"
                variant="soft"
                :color="badgeColor(estadoDeLote(lote))"
              >
                {{ badgeTexto(estadoDeLote(lote)) }}
              </UBadge>
              <UBadge
                v-if="idx === 0"
                size="xs"
                color="primary"
                variant="soft"
              >
                Más antiguo
              </UBadge>
            </div>
            <p class="text-xs text-muted mt-1">
              Costo: {{ Number(lote.precioUnitario || 0).toFixed(2) }} - Comprado: {{ fmt(lote.cantidadInicial) }}
            </p>
          </div>
          <span class="font-mono text-sm font-semibold" title="Disponible">
            {{ fmt(lote.saldo) }}
          </span>
        </div>
        <p class="text-xs text-muted">
          Por defecto se consume primero el lote más antiguo; si hay varios, puedes elegir otro en la venta.
        </p>
        <div class="rounded-md bg-elevated/50 p-3 text-sm flex justify-between">
          <span>Total</span>
          <span class="font-mono font-semibold">{{ fmt(stockTotal) }}</span>
        </div>
      </div>
    </div>
  </BaseDialog>
</template>
