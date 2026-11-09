<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <span class="text-sm font-medium">Lotes a usar</span>
        <div class="text-xs text-muted truncate">
          {{ resumenLotes }} · pedido: {{ Math.trunc(Number(props.cantidad) || 0) }}
        </div>
      </div>
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        :disabled="!lotes.length"
        @click="expandido = !expandido"
      >
        {{ expandido ? 'Cerrar' : (autoCalc ? 'Ajustar' : 'Editar') }}
      </UButton>
    </div>

    <p v-if="!lotes.length" class="text-xs text-muted">
      No hay lotes con stock.
    </p>

    <div v-show="expandido" class="space-y-2 pt-1">
      <div class="flex items-center gap-2">
        <UBadge size="sm" :color="autoCalc ? 'primary' : 'neutral'" variant="soft">
          {{ autoCalc ? 'FIFO automático' : 'Modo manual' }}
        </UBadge>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="toggleAuto"
        >
          {{ autoCalc ? 'Cambiar a manual' : 'Volver a FIFO auto' }}
        </UButton>
      </div>

      <ul class="space-y-2">
        <li v-for="lote in lotesOrdenados" :key="lote.id" class="flex items-center gap-2 rounded-md border p-2">
          <UCheckbox
            v-model="seleccionados[lote.id]"
            :disabled="autoCalc"
            class="shrink-0"
            @change="onManualToggle"
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
              v-if="!autoCalc"
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
        <span class="font-medium">{{ totalSeleccionado }}</span>.
      </div>
      <div v-if="faltante > 0" class="text-xs text-error font-medium">
        Faltan {{ faltante }} unidades; el total disponible de los seleccionados no alcanza.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ranksFifo, ordenarPorRango, calcularConsumoLotes } from '../../utils/inventario/consumoLotes'

const props = defineProps({
  lotes: { type: Array, default: () => [] },
  cantidad: { type: Number, default: 1 },
  autoFifo: { type: Boolean, default: true },
  productoNombre: { type: String, default: '' }
})

const emit = defineEmits(['update:consumo', 'update:autoFifo', 'update:selected'])

const autoCalc = ref(props.autoFifo)
const expandido = ref(false)
const seleccionados = ref({})

watch(() => props.autoFifo, (v) => {
  autoCalc.value = v
})

const lotesOrdenados = computed(() =>
  [...(props.lotes || [])].sort((a, b) => {
    if (a?.fechaEntrada && b?.fechaEntrada)
      return String(a.fechaEntrada).localeCompare(String(b.fechaEntrada))
    return 0
  })
)

const ranks = computed(() => {
  const out = {}
  if (autoCalc.value) {
    ranksFifo(lotesOrdenados.value).forEach((l) => {
      out[l.id] = l.rank
    })
    return out
  }
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
  if (autoCalc.value) return lotesOrdenados.value.filter(l => (l.saldo || 0) > 0)
  return ordenarPorRango(
    seleccionList.value.map(l => ({ id: l.id, rank: ranks.value[l.id], fechaEntrada: l.fechaEntrada }))
  ).map(s => lotesOrdenados.value.find(l => l.id === s.id))
})

const totalSeleccionado = computed(() =>
  seleccionList.value.reduce((acc, l) => acc + (Number(l.saldo) || 0), 0)
)

function autoSeleccionarSegunCantidad() {
  if (!autoCalc.value) return
  // Marca solo los lotes necesarios para cubrir la cantidad.
  const plan = calcularConsumoLotes(
    ranksFifo(lotesOrdenados.value.filter(l => (Number(l.saldo) || 0) > 0)),
    props.cantidad
  )
  const needed = new Set(plan.lineas.map(l => l.loteId))
  seleccionados.value = {}
  needed.forEach((id) => {
    seleccionados.value[id] = true
  })
  emitir()
}

const consumo = computed(() => {
  const basis = autoCalc.value
    ? lotesOrdenados.value.filter(l => (Number(l.saldo) || 0) > 0)
    : lotesSeleccionadosOrdered.value
  const enriched = basis
    .filter(l => (autoCalc.value || seleccionados.value[l.id]))
    .map(l => ({ id: l.id, saldo: l.saldo, rank: ranks.value[l.id] }))
  const sorted = ordenarPorRango(enriched)
  return calcularConsumoLotes(sorted, Math.trunc(Number(props.cantidad) || 0))
})

const faltante = computed(() => consumo.value.faltante)

const resumenLotes = computed(() => {
  const lineas = consumo.value.lineas
  if (!lineas.length) return 'Sin lote seleccionado'
  return lineas.map((line, idx) => {
    const l = lotesOrdenados.value.find(x => x.id === line.loteId)
    const etiqueta = l?.fechaEntrada || 'lote'
    return `#${idx + 1} ${etiqueta} (${line.cantidad})`
  }).join(' · ')
})

function onManualToggle() {
  // Cualquier edición manual desactiva el modo auto.
  autoCalc.value = false
  emit('update:autoFifo', false)
  emitir()
}

function onRank(id, valor) {
  const v = Number(valor)
  if (!Number.isFinite(v) || v < 1) return
  ranks.value[id] = v
  if (!seleccionados.value[id]) seleccionados.value[id] = true
  autoCalc.value = false
  emit('update:autoFifo', false)
  emitir()
}

function toggleAuto() {
  if (autoCalc.value) {
    // salir del auto: mantener los seleccionados actuales, orden FIFO.
    autoCalc.value = false
    const kept = {}
    Object.keys(seleccionados.value).forEach((k) => {
      if (seleccionados.value[k]) kept[k] = true
    })
    seleccionados.value = kept
    // por si todo vacío
    if (!Object.keys(seleccionados.value).length) {
      lotesOrdenados.value.slice(0, 1).forEach((l) => {
        seleccionados.value[l.id] = true
      })
    }
  } else {
    // volver a auto: rebuild
    autoCalc.value = true
    autoSeleccionarSegunCantidad()
  }
  emit('update:autoFifo', autoCalc.value)
  emitir()
}

function emitir() {
  emit('update:consumo', consumo.value)
  const order = Object.entries(ranks.value).map(([id, rank]) => ({ id, rank }))
  emit('update:selected', order)
}

watch(autoCalc, (v) => {
  if (v) autoSeleccionarSegunCantidad()
  emit('update:autoFifo', v)
  emitir()
}, { immediate: true })

watch(() => props.cantidad, () => {
  if (autoCalc.value) autoSeleccionarSegunCantidad()
}, { immediate: false })

watch(() => props.lotes, () => {
  if (autoCalc.value) autoSeleccionarSegunCantidad()
}, { immediate: true })

function formatearPrecio(v) {
  return Number(v || 0).toFixed(2)
}
</script>
