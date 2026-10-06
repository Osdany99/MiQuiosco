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
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Fecha">
          <UInput v-model="form.fecha" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Nota">
          <UInput v-model="form.notas" placeholder="Reposición del día..." class="w-full" />
        </UFormField>
      </div>

      <div class="space-y-2">
        <div
          v-for="(linea, idx) in form.lineas"
          :key="idx"
          class="border rounded p-2 space-y-1"
        >
          <div class="flex gap-2 items-start">
            <UFormField label="Producto" class="flex-1">
              <USelectMenu
                v-model="linea.productoId"
                :items="productos"
                value-key="id"
                label-key="nombre"
                description-key="descripcion"
                placeholder="Producto..."
                class="w-full"
              />
            </UFormField>
            <UFormField label="Cant." class="w-20">
              <BaseInputNumber v-model="linea.cantidad" :step="1" :min="1" />
            </UFormField>
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="error"
              variant="ghost"
              class="mt-6"
              @click="form.lineas.splice(idx, 1)"
            />
          </div>
          <p v-if="linea.productoId" class="text-xs text-muted">
            Disponible en almacén: {{ disponible(linea.productoId) }}
            <span v-if="Number(linea.cantidad) > disponible(linea.productoId)" class="text-error font-medium">
              — supera lo disponible
            </span>
          </p>
        </div>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          variant="outline"
          @click="agregarLinea"
        >
          Agregar producto
        </UButton>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  preseleccion: { type: Array, default: () => [] }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const productos = ref([])
const saldosMap = ref(new Map())
const guardando = ref(false)

const form = ref({ fecha: hoyLocal(), notas: '', lineas: [] })

function agregarLinea(productoId = null, cantidad = 0) {
  form.value.lineas.push({ productoId, cantidad })
}

function disponible(productoId) {
  return saldosMap.value.get(productoId)?.almacen ?? 0
}

const valida = computed(() =>
  form.value.lineas.length > 0
  && form.value.lineas.every(l =>
    l.productoId && Number(l.cantidad) >= 1 && Number(l.cantidad) <= disponible(l.productoId)
  )
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { fecha: hoyLocal(), notas: '', lineas: [] }
  const [prods, saldos] = await Promise.all([inv.cargarProductos(), inv.cargarSaldos()])
  productos.value = prods
  saldosMap.value = new Map((saldos ?? []).map(s => [s.productoId, s]))
  if (props.preseleccion.length > 0) {
    for (const p of props.preseleccion) agregarLinea(p.productoId, p.cantidad)
  } else {
    agregarLinea()
  }
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarTraspaso({
      fecha: form.value.fecha,
      notas: form.value.notas || null,
      lineas: form.value.lineas.map(l => ({
        productoId: l.productoId,
        cantidad: Math.trunc(Number(l.cantidad))
      }))
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
