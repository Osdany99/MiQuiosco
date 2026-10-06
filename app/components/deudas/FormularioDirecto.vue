<template>
  <div class="space-y-4">
    <UFormField v-if="conCliente" label="Cliente" required>
      <USelectMenu
        v-model="model.clienteId"
        :items="clientes"
        value-key="id"
        label-key="nombre"
        placeholder="Seleccionar cliente..."
        class="w-full"
      />
    </UFormField>

    <UFormField label="Sale del" required>
      <div class="flex gap-2 w-full">
        <UButton
          v-for="op in opcionesUbicacion"
          :key="op.value"
          size="sm"
          :variant="model.ubicacion === op.value ? 'solid' : 'outline'"
          :color="model.ubicacion === op.value ? 'primary' : 'neutral'"
          :icon="op.icon"
          class="flex-1"
          @click="model.ubicacion = op.value"
        >
          {{ op.label }}
        </UButton>
      </div>
    </UFormField>

    <UAlert
      v-if="model.ubicacion === 'quiosco'"
      color="info"
      variant="soft"
      icon="i-lucide-store"
      title="Sale del quiosco"
      description="Al descontar aquí, el producto va a quedar por debajo de tu mínimo. Revisa Quiosco para reponerlo."
    />

    <div v-for="(linea, idx) in model.lineas" :key="idx" class="space-y-2 rounded-md border border-gray-200 p-3 dark:border-gray-800">
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
            @update:model-value="onProducto(linea)"
          />
        </UFormField>
        <UFormField label="Cant." class="w-24">
          <BaseInputNumber v-model="linea.cantidad" placeholder="0" />
        </UFormField>
        <UButton
          v-if="model.lineas.length > 1"
          icon="i-lucide-trash-2"
          color="error"
          variant="ghost"
          size="sm"
          class="mt-7"
          aria-label="Quitar línea"
          @click="quitar(idx)"
        />
      </div>
      <UFormField label="Precio de venta">
        <BaseInputNumber v-model="linea.precioVentaUsado" placeholder="0" />
      </UFormField>
      <p v-if="linea.productoId" class="text-xs text-muted">
        Subtotal: <span class="font-mono">{{ fmtPrecio(linea.cantidad * linea.precioVentaUsado) }}</span>
      </p>
    </div>

    <UButton
      size="sm"
      variant="outline"
      icon="i-lucide-plus"
      label="Agregar producto"
      @click="agregar"
    />

    <div class="rounded-md bg-elevated/50 p-3 text-sm flex justify-between">
      <span>Total</span>
      <span class="font-mono font-semibold">{{ fmtPrecio(total) }}</span>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  productos: { type: Array, default: () => [] },
  clientes: { type: Array, default: () => [] },
  // La venta directa en efectivo no lleva cliente; la deuda directa sí.
  conCliente: { type: Boolean, default: false }
})

const model = defineModel({ type: Object, required: true })

const opcionesUbicacion = [
  { value: 'almacen', label: 'Almacén', icon: 'i-lucide-warehouse' },
  { value: 'quiosco', label: 'Quiosco', icon: 'i-lucide-store' }
]

const total = computed(() =>
  (model.value.lineas ?? []).reduce((s, l) => s + (Number(l.cantidad) || 0) * (Number(l.precioVentaUsado) || 0), 0)
)

function agregar() {
  model.value.lineas.push({ productoId: null, cantidad: 1, precioVentaUsado: 0, secuencia: model.value.lineas.length })
}

function quitar(idx) {
  model.value.lineas.splice(idx, 1)
}

function onProducto(linea) {
  const p = props.productos.find(x => x.id === linea.productoId)
  if (p) linea.precioVentaUsado = Number(p.precioVentaActual) || 0
}

if (!model.value.lineas?.length) agregar()
</script>
