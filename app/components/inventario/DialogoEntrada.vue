<template>
  <BaseDialog
    v-model="isOpen"
    title="Entrada al almacén"
    description="Registra una compra: fecha, dónde se compró y qué entró."
    confirm-text="Guardar entrada"
    :loading="guardando"
    :disabled-guardar="!valida"
    @confirm="confirmar"
    @cancel="isOpen = false"
  >
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-2">
        <UFormField label="Fecha">
          <UInput v-model="form.fechaEntrada" type="date" class="w-full" />
        </UFormField>
        <UFormField label="Proveedor (opcional)">
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
      <div class="grid grid-cols-2 gap-2">
        <UFormField v-if="!form.proveedorId" label="¿Dónde se compró?">
          <UInput v-model="form.lugarCompra" placeholder="Mercado, tienda..." class="w-full" />
        </UFormField>
        <UFormField label="Detalle de la compra">
          <UInput v-model="form.detalleCompra" placeholder="3 cajas x 24..." class="w-full" />
        </UFormField>
      </div>

      <div class="space-y-2">
        <div
          v-for="(linea, idx) in form.lineas"
          :key="idx"
          class="flex gap-2 items-start border rounded p-2"
        >
          <UFormField label="Producto" class="flex-1">
            <USelectMenu
              v-model="linea.productoId"
              :items="productosParaLinea(idx)"
              value-key="id"
              label-key="nombre"
              placeholder="Producto..."
              class="w-full"
            />
          </UFormField>
          <UFormField label="Cant." class="w-20">
            <BaseInputNumber v-model="linea.cantidad" :step="1" :min="1" />
          </UFormField>
          <UFormField label="P. compra" class="w-28" :error="faltaPrecio(linea)">
            <BaseInputNumber v-model="linea.precioUnitario" :min="0" />
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
        <USelectMenu
          v-model="seleccion"
          :items="productosDisponibles"
          value-key="id"
          label-key="nombre"
          multiple
          placeholder="Buscar productos para agregar..."
          class="w-full"
          @update:model-value="agregarProductos"
        />
      </div>

      <div class="space-y-1 text-right">
        <p v-if="totalEntrada > 0" class="text-sm text-muted">
          Total compra: {{ fmtPrecio(totalEntrada) }}
        </p>
        <p v-if="lineasSinPrecio > 0" class="text-sm text-error">
          {{ lineasSinPrecio }} producto(s) sin precio de compra
        </p>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
const isOpen = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['guardado'])

const inv = useInventario()
const toast = useToast()

const productos = ref([])
const proveedoresItems = ref([])
const seleccion = ref([])
/** Productos que ya entraron alguna vez: su precio de compra ya es conocido. */
const productosConLotes = ref(new Set())
const guardando = ref(false)

const form = ref({
  fechaEntrada: hoyLocal(),
  proveedorId: null,
  lugarCompra: '',
  detalleCompra: '',
  lineas: []
})

/** Solo lo que todavía no está en el formulario: evita líneas duplicadas. */
const productosDisponibles = computed(() => {
  const usados = new Set(form.value.lineas.map(l => l.productoId).filter(Boolean))
  return productos.value.filter(p => !usados.has(p.id))
})

/** Para una línea concreta, excluye los productos ya usados en las otras. */
function productosParaLinea(idx) {
  const otros = new Set(
    form.value.lineas.filter((_, i) => i !== idx).map(l => l.productoId).filter(Boolean)
  )
  return productos.value.filter(p => !otros.has(p.id))
}

/** Agrega de una vez varios productos a la entrada (carga inicial o compra grande). */
function agregarProductos(ids) {
  seleccion.value = []
  for (const id of ids ?? []) {
    const p = productos.value.find(x => x.id === id)
    if (!p) continue
    form.value.lineas.push({
      productoId: p.id,
      cantidad: 0,
      precioUnitario: Number(p.precioCompraActual) || 0
    })
  }
}

/**
 * El precio de compra solo se captura en la entrada al almacén, no en /productos.
 * Un producto que nunca ha entrado sí necesita precio aquí: dejarlo en 0 crea un
 * lote a costo cero y deja el valorizado y los márgenes falseados.
 */
function faltaPrecio(linea) {
  if (!linea.productoId) return false
  if (Number(linea.precioUnitario) > 0) return false
  return !productosConLotes.value.has(linea.productoId)
}

const lineasSinPrecio = computed(() => form.value.lineas.filter(faltaPrecio).length)

const valida = computed(() =>
  form.value.lineas.length > 0
  && form.value.lineas.every(l => l.productoId && Number(l.cantidad) >= 1 && !faltaPrecio(l))
)

const totalEntrada = computed(() =>
  form.value.lineas.reduce((s, l) => s + Number(l.cantidad || 0) * Number(l.precioUnitario || 0), 0)
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { fechaEntrada: hoyLocal(), proveedorId: null, lugarCompra: '', detalleCompra: '', lineas: [] }
  seleccion.value = []
  const [prods, provs, loteRows] = await Promise.all([
    inv.cargarProductos(),
    inv.cargarProveedores(),
    inv.cargarLotes().catch(() => [])
  ])
  productos.value = prods
  proveedoresItems.value = (provs ?? []).filter(p => p.activo !== false)
  productosConLotes.value = new Set((loteRows ?? []).filter(l => !l.anulado).map(l => l.productoId))
})

async function confirmar() {
  guardando.value = true
  try {
    await inv.registrarEntrada({
      fechaEntrada: form.value.fechaEntrada,
      proveedorId: form.value.proveedorId ?? null,
      lugarCompra: form.value.proveedorId ? null : (form.value.lugarCompra || null),
      detalleCompra: form.value.detalleCompra || null,
      lineas: form.value.lineas.map(l => ({
        productoId: l.productoId,
        cantidad: Math.trunc(Number(l.cantidad)),
        precioUnitario: Number(l.precioUnitario) || 0
      }))
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
