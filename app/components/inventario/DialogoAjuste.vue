<template>
  <BaseDialog
    v-model="isOpen"
    :title="esDevolucion ? 'Devolver al almacén' : 'Ajuste de inventario'"
    :description="esDevolucion
      ? 'La mercancía vuelve del quiosco al almacén. Se conserva el costo del lote.'
      : 'Merma (se pierde) o devolución (vuelve del quiosco al almacén).'"
    :confirm-text="esDevolucion ? 'Registrar devolución' : 'Guardar ajuste'"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <!-- Producto y ubicación vienen de la fila: no se cambian aquí. -->
      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2">
        <span class="font-medium truncate">{{ nombreProducto || '—' }}</span>
        <UBadge
          size="sm"
          variant="soft"
          color="neutral"
          :icon="ubicacion === 'quiosco' ? 'i-lucide-store' : 'i-lucide-warehouse'"
          :label="etiquetaUbicacion"
        />
      </div>
      <UFormField v-if="permiteElegirTipo" label="Tipo">
        <USelectMenu
          v-model="form.tipo"
          :items="tipos"
          value-key="id"
          label-key="nombre"
          class="w-full"
        />
      </UFormField>
      <UFormField label="Cantidad">
        <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
      </UFormField>
      <p class="text-xs text-muted">
        Disponible en {{ etiquetaUbicacion }}: {{ disponible }}
      </p>
      <UFormField label="Motivo (obligatorio)">
        <UInput v-model="form.motivo" placeholder="Se rompió, vencido..." class="w-full" />
      </UFormField>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  productoId: { type: String, default: null },
  // Ubicación de la vista desde la que se abrió: el ajuste nunca la cambia.
  ubicacion: { type: String, default: 'quiosco' }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const nombreProducto = ref('')
const saldosMap = ref(new Map())
const guardando = ref(false)

const tipos = [{ id: 'merma', nombre: 'Merma' }, { id: 'devolucion', nombre: 'Devolución al almacén' }]

const form = ref({ productoId: null, tipo: 'merma', cantidad: 0, motivo: '' })

const esDevolucion = computed(() => form.value.tipo === 'devolucion')

/**
 * La devolución siempre sale del quiosco, así que solo tiene sentido pedirla
 * desde esa vista. En el almacén el tipo queda fijo en merma.
 */
const permiteElegirTipo = computed(() => props.ubicacion === 'quiosco')

const etiquetaUbicacion = computed(() => esDevolucion.value ? 'Quiosco' : (props.ubicacion === 'almacen' ? 'Almacén' : 'Quiosco'))
const disponible = computed(() => {
  const s = saldosMap.value.get(form.value.productoId)
  if (!s) return 0
  return props.ubicacion === 'almacen' ? s.almacen : s.quiosco
})
const valida = computed(() =>
  form.value.productoId
  && Number(form.value.cantidad) >= 1
  && Number(form.value.cantidad) <= disponible.value
  && form.value.motivo.trim().length > 0
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { productoId: props.productoId, tipo: 'merma', cantidad: 0, motivo: '' }
  const [prods, saldos] = await Promise.all([inv.cargarProductos(), inv.cargarSaldos()])
  nombreProducto.value = (prods ?? []).find(p => p.id === props.productoId)?.nombre ?? ''
  saldosMap.value = new Map((saldos ?? []).map(s => [s.productoId, s]))
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarAjuste({
      productoId: form.value.productoId,
      tipo: form.value.tipo,
      ubicacion: esDevolucion.value ? 'quiosco' : props.ubicacion,
      cantidad: Math.trunc(Number(form.value.cantidad)),
      motivo: form.value.motivo.trim(),
      nota: null
    })
    toast.add({ title: 'Ajuste guardado', color: 'success' })
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
