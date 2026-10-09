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
const saldosMap = ref(new Map())
const guardando = ref(false)

const form = ref({ cantidad: 0 })

const disponible = computed(() => saldosMap.value.get(props.productoId)?.almacen ?? 0)
const superaDisponible = computed(() => Number(form.value.cantidad) > disponible.value)

const valida = computed(() =>
  Boolean(props.productoId)
  && Number(form.value.cantidad) >= 1
  && !superaDisponible.value
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { cantidad: 0 }
  const [prods, saldos] = await Promise.all([inv.cargarProductos(), inv.cargarSaldos()])
  nombreProducto.value = (prods ?? []).find(p => p.id === props.productoId)?.nombre ?? ''
  saldosMap.value = new Map((saldos ?? []).map(s => [s.productoId, s]))
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarTraspaso({
      // El traspaso se fecha solo: hoy es el día en que se repone.
      fecha: hoyLocal(),
      notas: null,
      lineas: [{
        productoId: props.productoId,
        cantidad: Math.trunc(Number(form.value.cantidad))
      }]
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
