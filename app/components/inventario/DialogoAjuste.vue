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
      <UFormField label="Producto">
        <USelectMenu
          v-model="form.productoId"
          :items="productos"
          value-key="id"
          label-key="nombre"
          placeholder="Producto..."
          class="w-full"
        />
      </UFormField>
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Tipo">
          <USelectMenu
            v-model="form.tipo"
            :items="tipos"
            value-key="id"
            label-key="nombre"
            class="w-full"
          />
        </UFormField>
        <UFormField v-if="form.tipo === 'merma'" label="Ubicación">
          <USelectMenu
            v-model="form.ubicacion"
            :items="ubicaciones"
            value-key="id"
            label-key="nombre"
            class="w-full"
          />
        </UFormField>
      </div>
      <UFormField label="Cantidad">
        <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
      </UFormField>
      <p v-if="form.productoId" class="text-xs text-muted">
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
  // 'merma' para el ajuste manual, 'devolucion' cuando se abre desde
  // "Devolver al almacén" en /quiosco.
  tipoInicial: { type: String, default: 'merma' }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const productos = ref([])
const saldosMap = ref(new Map())
const guardando = ref(false)

const tipos = [{ id: 'merma', nombre: 'Merma' }, { id: 'devolucion', nombre: 'Devolución al almacén' }]
const ubicaciones = [{ id: 'quiosco', nombre: 'Quiosco' }, { id: 'almacen', nombre: 'Almacén' }]

const form = ref({ productoId: null, tipo: 'merma', ubicacion: 'quiosco', cantidad: 0, motivo: '' })

const esDevolucion = computed(() => props.tipoInicial === 'devolucion')

const etiquetaUbicacion = computed(() => form.value.tipo === 'devolucion' ? 'quiosco' : form.value.ubicacion)
const disponible = computed(() => {
  const s = saldosMap.value.get(form.value.productoId)
  if (!s) return 0
  return etiquetaUbicacion.value === 'almacen' ? s.almacen : s.quiosco
})
const valida = computed(() =>
  form.value.productoId
  && Number(form.value.cantidad) >= 1
  && Number(form.value.cantidad) <= disponible.value
  && form.value.motivo.trim().length > 0
)

watch(isOpen, async (open) => {
  if (!open) return
  const tipo = props.tipoInicial === 'devolucion' ? 'devolucion' : 'merma'
  // La devolución siempre sale del quiosco; en merma la ubicación se elige.
  form.value = { productoId: props.productoId, tipo, ubicacion: 'quiosco', cantidad: 0, motivo: '' }
  const [prods, saldos] = await Promise.all([inv.cargarProductos(), inv.cargarSaldos()])
  productos.value = prods
  saldosMap.value = new Map((saldos ?? []).map(s => [s.productoId, s]))
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarAjuste({
      productoId: form.value.productoId,
      tipo: form.value.tipo,
      ubicacion: form.value.tipo === 'devolucion' ? 'quiosco' : form.value.ubicacion,
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
