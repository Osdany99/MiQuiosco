<template>
  <BaseDialog
    v-model="isOpen"
    :title="esDeuda ? 'Deuda directa' : 'Venta directa'"
    :description="`Sale de ${etiquetaUbicacion} · ${producto?.nombre ?? ''}`"
    :confirm-text="esDeuda ? 'Registrar deuda' : 'Registrar venta'"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <!-- Producto y ubicación vienen de la fila desde la que se abrió el
           diálogo: no se cambian aquí, solo se confirman. -->
      <UFormField v-if="esDeuda" label="Cliente" required>
        <USelectMenu
          v-model="form.clienteId"
          :items="clientes"
          value-key="id"
          label-key="nombre"
          placeholder="Seleccionar cliente..."
          class="w-full"
        />
      </UFormField>

      <div class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2">
        <span class="font-medium truncate">{{ producto?.nombre ?? '—' }}</span>
        <UBadge
          size="sm"
          variant="soft"
          color="neutral"
          :icon="ubicacion === 'quiosco' ? 'i-lucide-store' : 'i-lucide-warehouse'"
          :label="etiquetaUbicacion"
        />
      </div>

      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Cantidad">
          <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
        </UFormField>
        <UFormField label="Precio de venta">
          <BaseInputNumber v-model="form.precioVentaUsado" :increment="false" :decrement="false" />
        </UFormField>
      </div>

      <p v-if="superaDisponible" class="text-xs text-error font-medium">
        Solo hay {{ disponible }} en {{ etiquetaUbicacion.toLowerCase() }}.
      </p>

      <div class="rounded-md bg-elevated/50 p-3 text-sm flex justify-between">
        <span>Total</span>
        <span class="font-mono font-semibold">{{ fmtPrecio(total) }}</span>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const props = defineProps({
  // Fila de saldos desde la que se abrió (vistaSaldos): trae productoId,
  // nombre, precioVentaActual y el stock de cada ubicación.
  producto: { type: Object, default: null },
  ubicacion: { type: String, default: 'almacen' },
  // 'venta' = efectivo fuera del cuadre; 'deuda' = fiado a un cliente.
  modo: { type: String, default: 'venta' }
})
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const fiado = useCuentasFiado()
const toast = useToast()
const auth = useAuth()

const clientes = ref([])
const guardando = ref(false)

const form = ref({ clienteId: null, cantidad: 1, precioVentaUsado: 0 })

const esDeuda = computed(() => props.modo === 'deuda')
const etiquetaUbicacion = computed(() => props.ubicacion === 'quiosco' ? 'Quiosco' : 'Almacén')
const disponible = computed(() => Number(props.producto?.[props.ubicacion] ?? 0))
const superaDisponible = computed(() =>
  Number(form.value.cantidad) > disponible.value
)
const total = computed(() =>
  (Number(form.value.cantidad) || 0) * (Number(form.value.precioVentaUsado) || 0)
)

const valida = computed(() =>
  Boolean(props.producto?.productoId)
  && Number(form.value.cantidad) >= 1
  && !superaDisponible.value
  && Number(form.value.precioVentaUsado) >= 0
  && (!esDeuda.value || Boolean(form.value.clienteId))
)

watch(isOpen, async (open) => {
  if (!open) return
  // La línea nace del producto tocado: cantidad 1 y su precio de catálogo.
  // El jefe puede ajustar ambos, pero no cambiar qué producto se vende.
  form.value = {
    clienteId: null,
    cantidad: 1,
    precioVentaUsado: Number(props.producto?.precioVentaActual ?? 0)
  }
  if (esDeuda.value) {
    try {
      clientes.value = await fiado.cargarClientes(auth.usuarioActual.value?.puestoId) ?? []
    } catch {
      clientes.value = []
    }
  }
})

async function confirmar() {
  const lineas = [{
    productoId: props.producto.productoId,
    cantidad: Math.trunc(Number(form.value.cantidad) || 0),
    precioVentaUsado: Number(form.value.precioVentaUsado) || 0,
    secuencia: 0
  }]
  guardando.value = true
  try {
    if (esDeuda.value) {
      // registrarDeudaDirecta no lanza: avisa con { ok: false } y ya puso el
      // toast, así que sin éxito el diálogo se queda abierto.
      const r = await fiado.registrarDeudaDirecta({
        clienteId: form.value.clienteId,
        ubicacion: props.ubicacion,
        lineas
      })
      if (!r?.ok) return
      toast.add({ title: 'Deuda registrada', color: 'success' })
    } else {
      await inv.registrarVentaDirecta({ ubicacion: props.ubicacion, lineas })
      toast.add({ title: 'Venta registrada', color: 'success' })
    }
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error.
  } finally {
    guardando.value = false
  }
}
</script>
