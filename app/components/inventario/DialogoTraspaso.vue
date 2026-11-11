<template>
  <BaseDialog
    v-model="isOpen"
    title="Traspasar al quiosco"
    description="El almacén repone el quiosco. Se conserva el costo del lote."
    confirm-text="Traspasar"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <!-- Producto y fecha vienen de la fila y del día: no se cambian aquí. -->
      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2">
        <span class="font-medium truncate">{{ nombreProducto || '—' }}</span>
        <UBadge
          size="sm"
          variant="soft"
          color="neutral"
          icon="i-lucide-warehouse"
          label="Almacén"
        />
      </div>

      <InventarioLotesPicker
        v-if="lotes.length"
        :lotes="lotes"
        :cantidad="Number(form.cantidad) || 0"
        :producto-nombre="nombreProducto"
        @update:consumo="onConsumo"
      />

      <UFormField label="Cantidad">
        <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
      </UFormField>
      <p class="text-xs text-muted">
        Disponible en almacén: {{ disponible }}
        <span v-if="superaDisponible" class="text-error font-medium">
          — supera lo disponible
        </span>
      </p>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  productoId: { type: String, default: null }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const nombreProducto = ref('')
const lotes = ref([])
const guardando = ref(false)
const consumoPlan = ref({ lineas: [], consumido: 0, faltante: 0 })
function onConsumo(plan) {
  if (plan) consumoPlan.value = plan
}
const form = ref({ cantidad: 0, loteId: null })

const opcionesLote = computed(() =>
  lotes.value.map(l => ({
    id: l.id,
    label: `${l.fechaEntrada} · ${Number(l.precioUnitario || 0).toFixed(2)} · disp ${l.saldo}${l.estadoLote && l.estadoLote !== 'normal' ? ` · ${l.estadoLote}` : ''}`
  }))
)

const loteSeleccionado = computed(() =>
  (lotes.value ?? []).find(l => l.id === form.value.loteId) ?? lotes.value?.[0] ?? null
)

const disponible = computed(() => (consumoPlan.value.consumido ?? 0))
const superaDisponible = computed(() => consumoPlan.value.faltante > 0)

const valida = computed(() =>
  Boolean(props.productoId)
  && Number(form.value.cantidad) >= 1
  && !superaDisponible.value
  && (lotes.value.length === 0 || consumoPlan.value.lineas.length > 0)
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { cantidad: 1, loteId: null }
  const [prods, ls] = await Promise.all([inv.cargarProductos(), inv.lotesConStock(props.productoId, 'almacen')])
  nombreProducto.value = (prods ?? []).find(p => p.id === props.productoId)?.nombre ?? ''
  lotes.value = ls ?? []
  form.value.loteId = lotes.value[0]?.id ?? null
})

async function confirmar() {
  const planLineas = (consumoPlan.value?.lineas || []).filter(l => Number(l?.cantidad) > 0)
  const fallback = [{ loteId: form.value.loteId ?? lotes.value[0]?.id ?? null, cantidad: Math.trunc(Number(form.value.cantidad) || 0) }]
  const lineas = (planLineas.length ? planLineas : fallback).map(l => ({
    productoId: props.productoId,
    cantidad: Math.trunc(Number(l.cantidad) || 0),
    loteId: l.loteId ?? form.value.loteId ?? lotes.value[0]?.id ?? null
  }))
  guardando.value = true
  try {
    await inv.registrarTraspaso({
      fecha: hoyLocal(),
      notas: null,
      lineas
    })
    toast.add({ title: 'Traspaso listo', description: 'El quiosco quedó repuesto.', color: 'success' })
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
