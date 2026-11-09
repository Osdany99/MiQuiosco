<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <span class="text-sm font-medium">Lotes de {{ productoNombre || 'producto' }}</span>
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        :disabled="!lotes.length"
        @click="alternarFifo"
      >
        {{ autoFifo ? 'FIFO automático' : 'Modo manual' }}
      </UButton>
    </div>

    <p v-if="!lotes.length" class="text-xs text-muted">
      No hay lotes con stock.
    </p>

    <ul v-else class="space-y-2">
      <li v-for="lote in lotesOrdenados" :key="lote.id" class="flex items-center gap-2 rounded-md border p-2">
        <UCheckbox
          v-model="seleccionados[lote.id]"
          :disabled="autoFifo"
          class="shrink-0"
          @change="onToggle(lote.id)"
        />
        <div class="min-w-0 flex-1">
          <div class="text-xs text-muted">
            {{ lote.fechaEntrada || 'sin fecha' }} · {{ formatearPrecio(lote.precioUnitario) }} · disp {{ lote.saldo }}
            <span v-if="lote.estadoLote && lote.estadoLote !== 'normal'" class="ml-1 font-medium">
              · {{ lote.estadoLote }}
            </span>
          </div>
        </div>
        <div class="shrink-0">
          <input
            v-if="!autoFifo"
            type="number"
            min="1"
            :value="ranks[lote.id]"
            class="w-14 rounded border px-1 py-0.5 text-center text-sm"
            @change="onRank(lote.id, $event.target.value)"
          >
          <UBadge
            v-else
            size="sm"
            color="neutral"
            variant="soft"
          >
            #{{ ranks[lote.id] }}
          </UBadge>
        </div>
      </li>
    </ul>

    <div class="text-xs text-muted">
      Se consume por el orden #1, luego #2, etc. Total disponible de los seleccionados:
      <span class="font-medium">{{ totalSeleccionado }}</span> · pedido: {{ cantidad }}.
    </div>
    <div v-if="faltante > 0" class="text-xs text-error font-medium">
      Faltan {{ faltante }} unidades; el total disponible de los seleccionados no alcanza.
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ranksFifo, ordenarPorRango, calcularConsumoLotes } from '../utils/inventario/consumoLotes'

const props = defineProps({
  lotes: { type: Array, default: () => [] },
  cantidad: { type: Number, default: 1 },
  autoFifo: { type: Boolean, default: true },
  productoNombre: { type: String, default: '' }
})

const emit = defineEmits(['update:consumo', 'update:autoFifo', 'update:selected'])

const autoFifoLocal = ref(props.autoFifo)
watch(() => props.autoFifo, (v) => {
  autoFifoLocal.value = v
})

const seleccionados = ref({})

const lotesOrdenados = computed(() =>
  [...(props.lotes || [])].sort((a, b) => {
    if (a?.fechaEntrada && b?.fechaEntrada)
      return String(a.fechaEntrada).localeCompare(String(b.fechaEntrada))
    return 0
  })
)

const ranks = computed(() => {
  const out = {}
  if (autoFifoLocal.value) {
    ranksFifo(lotesOrdenados.value).forEach((l) => {
      out[l.id] = l.rank
    })
    return out
  }
  // manual: mantener asignación actual, por defecto FIFO.
  const sel = lotesSeleccionadosOrdered.value
  sel.forEach((s, i) => {
    out[s.id] = i + 1
  })
  lotesOrdenados.value.forEach((l) => {
    if (seleccionados.value[l.id] && out[l.id] == null) out[l.id] = Object.keys(out).length + 1
  })
  return out
})

const seleccionList = computed(() =>
  lotesOrdenados.value.filter(l => seleccionados.value[l.id])
)

const lotesSeleccionadosOrdered = computed(() => {
  if (autoFifoLocal.value) return lotesOrdenados.value
  return ordenarPorRango(
    seleccionList.value.map(l => ({ id: l.id, rank: ranks.value[l.id], fechaEntrada: l.fechaEntrada }))
  ).map(s => lotesOrdenados.value.find(l => l.id === s.id))
})

const totalSeleccionado = computed(() =>
  seleccionList.value.reduce((acc, l) => acc + (Number(l.saldo) || 0), 0)
)

const consumo = computed(() => {
  const basis = autoFifoLocal.value
    ? (lotesOrdenados.value.filter(l => l.saldo > 0))
    : lotesSeleccionadosOrdered.value
  const enriched = basis.map(l => ({ id: l.id, saldo: l.saldo, rank: ranks.value[l.id] }))
  const sorted = ordenarPorRango(enriched)
  return calcularConsumoLotes(sorted, props.cantidad)
})

const faltante = computed(() => consumo.value.faltante)

function onToggle() {
  emitir()
}

function onRank(id, valor) {
  const v = Number(valor)
  if (!Number.isFinite(v) || v < 1) return
  ranks.value[id] = v
  if (!seleccionados.value[id]) seleccionados.value[id] = true
  emitir()
}

function alternarFifo() {
  autoFifoLocal.value = !autoFifoLocal.value
  // al cambiar, asegurarnos de que al menos los lotes FIFO estén marcados.
  if (autoFifoLocal.value) {
    lotesOrdenados.value.forEach((l) => {
      seleccionados.value[l.id] = true
    })
  }
  emit('update:autoFifo', autoFifoLocal.value)
  emitir()
}

function emitir() {
  emit('update:consumo', consumo.value)
  const order = autoFifoLocal.value
    ? lotesOrdenados.value.filter(l => (l.saldo || 0) > 0).map(l => ({ id: l.id, rank: ranks.value[l.id] }))
    : Object.entries(ranks.value).map(([id, rank]) => ({ id, rank }))
  emit('update:selected', order)
}

defineExpose({ consumo, seleccionados, ranks })

watch(autoFifoLocal, (v) => {
  if (v) {
    lotesOrdenados.value.forEach((l) => {
      seleccionados.value[l.id] = true
    })
  }
  emitir()
}, { immediate: true })

watch(() => props.cantidad, () => emitir(), { immediate: true })

function formatearPrecio(v) {
  return Number(v || 0).toFixed(2)
}
</script>
