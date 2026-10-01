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
              :items="productos"
              value-key="id"
              label-key="nombre"
              placeholder="Producto..."
              class="w-full"
            />
          </UFormField>
          <UFormField label="Cant." class="w-20">
            <BaseInputNumber v-model="linea.cantidad" :step="1" :min="1" />
          </UFormField>
          <UFormField label="P. compra" class="w-28">
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
        <UButton
          icon="i-lucide-plus"
          size="sm"
          variant="outline"
          @click="agregarLinea"
        >
          Agregar producto
        </UButton>
      </div>

      <p v-if="totalEntrada > 0" class="text-sm text-muted text-right">
        Total compra: {{ fmtPrecio(totalEntrada) }}
      </p>
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
const guardando = ref(false)

const form = ref({
  fechaEntrada: hoyLocal(),
  proveedorId: null,
  lugarCompra: '',
  detalleCompra: '',
  lineas: []
})

function agregarLinea() {
  form.value.lineas.push({ productoId: null, cantidad: 0, precioUnitario: 0 })
}

const valida = computed(() =>
  form.value.lineas.length > 0
  && form.value.lineas.every(l => l.productoId && Number(l.cantidad) >= 1)
)

const totalEntrada = computed(() =>
  form.value.lineas.reduce((s, l) => s + Number(l.cantidad || 0) * Number(l.precioUnitario || 0), 0)
)

watch(isOpen, async (open) => {
  if (!open) return
  form.value = { fechaEntrada: hoyLocal(), proveedorId: null, lugarCompra: '', detalleCompra: '', lineas: [] }
  agregarLinea()
  const [prods, provs] = await Promise.all([inv.cargarProductos(), inv.cargarProveedores()])
  productos.value = prods
  proveedoresItems.value = (provs ?? []).filter(p => p.activo !== false)
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
