<template>
  <div class="space-y-4">
    <div class="flex gap-2 items-end">
      <UFormField label="Cliente (opcional)" class="flex-1">
        <USelectMenu
          v-model="model.clienteId"
          :items="[{ id: null, nombre: 'Sin cliente' }, ...clientes]"
          value-key="id"
          label-key="nombre"
          placeholder="Sin cliente..."
          class="w-full"
          :search-input="true"
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
      <BaseForm
        ref="formRef"
        v-model="nuevoCliente"
        :fields="clienteFields"
        :schema="usuarioSchema"
      />
    </BaseDialog>

    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Tipo" class="col-span-2">
        <USegmentedGroup
          v-model="model.tipo"
          :items="[
            { value: 'regalo', label: 'Regalo' },
            { value: 'descuento', label: 'Descuento' }
          ]"
          size="md"
          class="w-full"
          @update:model-value="onTipoChange"
        />
      </UFormField>

      <UFormField label="Producto" class="col-span-2">
        <USelectMenu
          v-model="model.productoId"
          :items="productos"
          value-key="id"
          label-key="nombre"
          placeholder="Seleccionar producto..."
          class="w-full"
          @update:model-value="onProductoChange"
        />
      </UFormField>

      <UFormField label="Cantidad">
        <BaseInputNumber v-model="model.cantidad" placeholder="0" @update:model-value="onCantidadChange" />
      </UFormField>

      <UFormField :label="model.tipo === 'regalo' ? 'Importe del regalo' : 'Monto descontado'">
        <BaseInputNumber v-model="model.monto" placeholder="0" />
      </UFormField>

      <UFormField label="Nota (opcional)" class="col-span-2">
        <UTextarea v-model="model.nota" placeholder="Observaciones..." :rows="2" />
      </UFormField>
    </div>
  </div>
</template>

<script setup>
import { usuarioSchema } from '../../../shared/schemas/usuario'

const props = defineProps({
  productos: { type: Array, default: () => [] },
  clientes: { type: Array, default: () => [] }
})

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['crear-cliente'])

const showCrearCliente = ref(false)
const nuevoCliente = ref({ nombre: '' })
const formRef = ref(null)

const clienteFields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', props: { class: 'w-full', maxlength: 100 } }
]

function onTipoChange(tipo) {
  if (model.value.productoId) {
    const prod = props.productos.find(p => p.id === model.value.productoId)
    if (prod) {
      const precio = Number(prod.precioVentaActual) || 0
      if (tipo === 'regalo') {
        // Un regalo entrega el producto: su importe (cantidad × precio) es lo
        // que deja de entrar, por eso se calcula automáticamente la cantidad.
        model.value.monto = (Number(model.value.cantidad) || 0) * precio
      }
    }
  }
}

function onProductoChange(productoId) {
  const prod = props.productos.find(p => p.id === productoId)
  if (prod) {
    const precio = Number(prod.precioVentaActual) || 0
    model.value.monto = (Number(model.value.cantidad) || 0) * precio
  }
}

function onCantidadChange() {
  if (model.value.cantidad == null || model.value.cantidad === '' || model.value.cantidad < 0) model.value.cantidad = 0
  if (model.value.tipo === 'regalo' && model.value.productoId) {
    const prod = props.productos.find(p => p.id === model.value.productoId)
    if (prod) {
      const precio = Number(prod.precioVentaActual) || 0
      model.value.monto = (Number(model.value.cantidad) || 0) * precio
    }
  }
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
