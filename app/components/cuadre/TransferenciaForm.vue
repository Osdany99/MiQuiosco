<template>
  <div class="space-y-4">
    <div class="flex gap-2 items-end">
      <UFormField label="Cliente" class="flex-1">
        <USelectMenu
          v-model="model.clienteId"
          :items="clientes"
          value-key="id"
          label-key="nombre"
          placeholder="Seleccionar cliente..."
          class="w-full"
          :disabled="editar"
        />
      </UFormField>
      <UButton
        v-if="!editar"
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
      <BaseForm
        ref="formRef"
        v-model="nuevoCliente"
        :fields="clienteFields"
        :schema="usuarioSchema"
      />
    </BaseDialog>

    <div v-for="(item, idx) in model.items" :key="item.productoId" class="flex gap-2 items-start">
      <UFormField label="Producto" class="flex-1">
        <USelectMenu
          v-model="item.productoId"
          :items="productosActivos"
          value-key="id"
          label-key="nombre"
          placeholder="Producto..."
          class="w-full"
          @update:model-value="onProductoChange(item)"
        />
      </UFormField>
      <UFormField label="Cant." class="w-20">
        <BaseInputNumber v-model="item.cantidad" placeholder="0" @update:model-value="onCantidadChange(item)" />
      </UFormField>
      <UFormField label="Precio" class="w-28">
        <BaseInputNumber v-model="item.precioVentaUsado" placeholder="0" :disabled="editar" />
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

    <p class="text-sm font-medium">
      Total: <span class="font-mono">{{ fmtPrecio(totalCalculado) }}</span>
    </p>
  </div>
</template>

<script setup>
import { usuarioSchema } from '../../../shared/schemas/usuario'

const props = defineProps({
  productosActivos: { type: Array, default: () => [] },
  clientes: { type: Array, default: () => [] },
  editar: { type: Boolean, default: false }
})

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['crear-cliente'])

const showCrearCliente = ref(false)
const nuevoCliente = ref({ nombre: '' })
const formRef = ref(null)

const clienteFields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', props: { class: 'w-full', maxlength: 100 } }
]

const totalCalculado = computed(() =>
  (model.value.items || []).reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precioVentaUsado) || 0), 0)
)

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

async function confirmarCrearCliente() {
  try {
    await formRef.value?.validate()
  } catch {
    return
  }
  emit('crear-cliente', { nombre: (nuevoCliente.value.nombre || '').trim() })
  showCrearCliente.value = false
  nuevoCliente.value = { nombre: '' }
}
</script>
