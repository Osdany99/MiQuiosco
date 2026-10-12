<template>
  <BaseDialog
    v-model="isOpen"
    title="Entrada al almacén"
    :description="nombreProducto ? `Lote de ${nombreProducto} al almacén. Se conserva el costo del lote.` : 'Registra una compra: qué entró y a qué precio.'"
    confirm-text="Guardar entrada"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <!-- El proveedor se administra aparte (/proveedores): con la bandera
           apagada el campo no se pinta y la entrada se guarda sin él. El código
           de abajo sigue vivo para reactivarlo. -->
      <div class="grid gap-2" :class="MOSTRAR_PROVEEDOR ? 'grid-cols-2' : 'grid-cols-1'">
        <UFormField label="Fecha">
          <UInput v-model="form.fechaEntrada" type="date" class="w-full" />
        </UFormField>
        <UFormField v-if="MOSTRAR_PROVEEDOR" label="Proveedor (opcional)">
          <USelectMenu
            v-model="form.proveedorId"
            :items="proveedoresItems"
            value-key="id"
            label-key="nombre"
            placeholder="Sin proveedor..."
            class="w-full"
          />
        </UFormField>
      </div>
      <p v-if="MOSTRAR_PROVEEDOR && proveedorActual?.lugar" class="text-xs text-muted -mt-2">
        Lugar: {{ proveedorActual.lugar }}
      </p>

      <!-- El producto viene de la fila desde la que se abrió: los lotes se
           registran de uno en uno y aquí no se cambia. -->
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

      <div class="flex gap-2 items-start">
        <UFormField label="Cant." class="w-20">
          <BaseInputNumber v-model="form.cantidad" :step="1" :min="1" />
        </UFormField>
        <UFormField label="P. compra" class="w-28" :error="faltaPrecio">
          <BaseInputNumber v-model="form.precioUnitario" :min="0" />
        </UFormField>
      </div>

      <div class="space-y-1 text-right">
        <p v-if="totalEntrada > 0" class="text-sm text-muted">
          Total compra: {{ fmtPrecio(totalEntrada) }}
        </p>
        <p v-if="faltaPrecio" class="text-sm text-error">
          Falta el precio de compra
        </p>
      </div>
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
const proveedoresItems = ref([])
/** Último precio pagado por cada producto, derivado de su lote más reciente. */
const ultimoPrecio = ref(new Map())
const guardando = ref(false)

const form = ref({
  productoId: null,
  fechaEntrada: hoyLocal(),
  proveedorId: null,
  cantidad: 0,
  precioUnitario: 0
})

/** El lugar de la tienda vive en el proveedor: el lote lo hereda al guardarse. */
const proveedorActual = computed(
  () => proveedoresItems.value.find(p => p.id === form.value.proveedorId) ?? null
)

/**
 * El precio de compra solo se captura en la entrada al almacén, no en
 * /productos. Un 0 aquí crea un lote a costo cero, que deja el valorizado del
 * stock y los márgenes falseados, así que SIEMPRE es error: no hay excepción
 * para productos que ya tienen lotes (ese era el hueco por el que se colaba).
 */
const faltaPrecio = computed(() => {
  if (!form.value.productoId) return false
  return !(Number(form.value.precioUnitario) > 0)
})

const valida = computed(() =>
  Boolean(form.value.productoId)
  && Number(form.value.cantidad) >= 1
  && !faltaPrecio.value
)

const totalEntrada = computed(() =>
  (Number(form.value.cantidad) || 0) * (Number(form.value.precioUnitario) || 0)
)

watch(isOpen, async (open) => {
  if (!open) return
  const [prods, provs, loteRows] = await Promise.all([
    inv.cargarProductos(),
    inv.cargarProveedores(),
    inv.cargarLotes().catch(() => [])
  ])
  const producto = (prods ?? []).find(p => p.id === props.productoId)
  nombreProducto.value = producto?.nombre ?? ''

  // El último precio pagado sale del LOTE más reciente, no de un espejo en el
  // producto: el lote es el único sitio donde ese precio existe de verdad.
  // Sale gratis de los lotes que ya se cargaron para nada más.
  const porProducto = new Map()
  for (const l of (loteRows ?? []).filter(l => !l.anulado)) {
    const previo = porProducto.get(l.productoId)
    const fa = String(previo?.fechaEntrada ?? '')
    const fb = String(l.fechaEntrada ?? '')
    const esMasNuevo = !previo
      || (fb !== fa ? fb > fa : Number(l.creadoEn ?? 0) > Number(previo.creadoEn ?? 0))
    if (esMasNuevo) porProducto.set(l.productoId, l)
  }
  ultimoPrecio.value = new Map(
    [...porProducto].map(([id, l]) => [id, Number(l.precioUnitario) || 0])
  )

  form.value = {
    productoId: props.productoId,
    fechaEntrada: hoyLocal(),
    proveedorId: null,
    // Se precarga el último precio pagado: es lo que el jefe quiere confirmar en
    // la mayoría de las compras.
    cantidad: 0,
    precioUnitario: ultimoPrecio.value.get(props.productoId) ?? 0
  }
  proveedoresItems.value = (provs ?? []).filter(p => p.activo !== false)
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarEntrada({
      fechaEntrada: form.value.fechaEntrada,
      proveedorId: form.value.proveedorId ?? null,
      // El detalle no se pide: la compra se describe con el proveedor y el precio.
      lugarCompra: proveedorActual.value?.lugar || null,
      detalleCompra: null,
      lineas: [{
        productoId: form.value.productoId,
        cantidad: Math.trunc(Number(form.value.cantidad)),
        precioUnitario: Number(form.value.precioUnitario) || 0
      }]
    })
    toast.add({ title: 'Entrada guardada', description: 'El stock del almacén se actualizó.', color: 'success' })
    isOpen.value = false
    emit('guardado')
  } catch {
    // useInventario ya muestra el toast de error
  } finally {
    guardando.value = false
  }
}
</script>
