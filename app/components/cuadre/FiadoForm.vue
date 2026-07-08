<template>
  <div class="space-y-4">
    <div class="flex gap-2 items-end">
      <UFormField label="Cliente" class="flex-1">
        <USelectMenu
          v-model="model.clienteId"
          :items="clientes"
          value-attribute="id"
          text-attribute="nombre"
          placeholder="Seleccionar cliente..."
          class="w-full"
        />
      </UFormField>
      <UButton
        icon="i-lucide-plus"
        size="sm"
        variant="outline"
        @click="showCrearCliente = true"
      />
    </div>

    <BaseDialog
      v-model="showCrearCliente"
      title="Nuevo cliente"
      confirm-text="Crear"
      @confirm="confirmarCrearCliente"
      @cancel="showCrearCliente = false"
    >
      <UFormField label="Nombre del cliente" required>
        <UInput v-model="nuevoNombre" placeholder="Nombre..." />
      </UFormField>
    </BaseDialog>

    <div v-for="(item, idx) in model.items" :key="idx" class="flex gap-2 items-start">
      <UFormField label="Producto" class="flex-1">
        <USelectMenu
          v-model="item.productoId"
          :items="productosActivos"
          value-attribute="id"
          text-attribute="nombre"
          placeholder="Producto..."
          class="w-full"
          @update:model-value="onProductoChange(item)"
        />
      </UFormField>
      <UFormField label="Cant." class="w-20">
        <BaseInputNumber v-model="item.cantidad" placeholder="0" @update:model-value="onCantidadChange(item)" />
      </UFormField>
      <UFormField label="Precio" class="w-28">
        <BaseInputNumber v-model="item.precioVentaUsado" placeholder="0" />
      </UFormField>
      <UButton
        icon="i-lucide-x"
        size="xs"
        color="error"
        variant="ghost"
        class="mt-6"
        @click="model.items.splice(idx, 1)"
      />
    </div>

    <UButton
      size="sm"
      variant="outline"
      icon="i-lucide-plus"
      label="Agregar producto"
      @click="agregarItem"
    />

    <div class="grid grid-cols-2 gap-4 pt-2">
      <UFormField label="Pago inicial (opcional)">
        <BaseInputNumber v-model="model.montoPagadoInicial" placeholder="0" />
      </UFormField>
      <UFormField label="Forma de pago">
        <USelectMenu
          v-model="model.formaPagoInicial"
          :items="[
            { label: 'Efectivo', value: 'efectivo' },
            { label: 'Transferencia', value: 'transferencia' }
          ]"
          value-attribute="value"
          text-attribute="label"
          class="w-full"
        />
      </UFormField>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  productosActivos: { type: Array, default: () => [] },
  clientes: { type: Array, default: () => [] }
})

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['crear-cliente'])

const showCrearCliente = ref(false)
const nuevoNombre = ref('')

function onProductoChange(item) {
  const prod = props.productosActivos.find(p => p.id === item.productoId)
  if (prod) item.precioVentaUsado = prod.precioVentaActual
}

function onCantidadChange(item) {
  if (item.cantidad == null || item.cantidad === '' || item.cantidad < 0) item.cantidad = 0
}

function agregarItem() {
  model.value.items.push({ productoId: '', cantidad: 0, precioVentaUsado: 0 })
}

function confirmarCrearCliente() {
  if (!nuevoNombre.value.trim()) return
  emit('crear-cliente', nuevoNombre.value.trim())
  showCrearCliente.value = false
  nuevoNombre.value = ''
}
</script>
