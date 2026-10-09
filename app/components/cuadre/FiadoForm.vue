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

    <!-- Producto ya decidido por la fila del cuadre: se muestra, no se elige.
         Sin precio editable (es el de esa línea) y sin poder añadir más
         productos: la deuda nace de un producto y una cantidad. -->
    <div
      v-if="productoFijo"
      class="flex gap-2 items-start"
    >
      <UFormField label="Producto" class="flex-1">
        <div class="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-3 py-2 dark:border-gray-800">
          <div class="min-w-0">
            <p class="truncate font-medium">
              {{ productoFijo.nombre }}
            </p>
            <p
              v-if="productoFijo.descripcion"
              class="truncate text-xs text-muted"
            >
              {{ productoFijo.descripcion }}
            </p>
          </div>
          <span class="shrink-0 font-mono text-sm">{{ fmtPrecio(productoFijo.precio) }}</span>
        </div>
      </UFormField>
      <UFormField label="Cant." class="w-24">
        <BaseInputNumber
          v-model="model.items[0].cantidad"
          placeholder="0"
          @update:model-value="onCantidadChange(model.items[0])"
        />
      </UFormField>
    </div>

    <template v-else>
      <div
        v-for="(item, idx) in model.items"
        :key="item.productoId"
        class="flex gap-2 items-start"
      >
        <UFormField label="Producto" class="flex-1">
          <USelectMenu
            v-model="item.productoId"
            :items="productosActivos"
            value-key="id"
            label-key="nombre"
            description-key="descripcion"
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
    </template>

    <div v-if="!editar" class="grid grid-cols-2 gap-4 pt-2">
      <UCollapsible v-model:open="pagoInicialOpen" class="col-span-2">
        <UButton
          variant="ghost"
          size="sm"
          :icon="pagoInicialOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          label="Pago inicial (opcional)"
        />
        <template #content>
          <div class="grid grid-cols-2 gap-4 pt-2">
            <UFormField label="Monto">
              <BaseInputNumber v-model="model.montoPagadoInicial" placeholder="0" />
            </UFormField>
            <UFormField label="Forma de pago">
              <USelectMenu
                v-model="model.formaPagoInicial"
                :items="[
                  { label: 'Efectivo', value: 'efectivo' },
                  { label: 'Transferencia', value: 'transferencia' }
                ]"
                value-key="value"
                label-key="label"
                class="w-full"
                :search-input="false"
              />
            </UFormField>
          </div>
        </template>
      </UCollapsible>
    </div>
  </div>
</template>

<script setup>
import { usuarioSchema } from '../../../shared/schemas/usuario'

const props = defineProps({
  productosActivos: { type: Array, default: () => [] },
  clientes: { type: Array, default: () => [] },
  editar: { type: Boolean, default: false },
  /**
   * { productoId, nombre, descripcion, precio } cuando el producto ya está
   * decidido (fiado launched desde la fila del cuadre). Entonces el formulario
   * muestra un solo ítem, sin selector ni precio editable, y `model.items`
   * tiene exactamente una entrada.
   */
  productoFijo: { type: Object, default: null }
})

const model = defineModel({ type: Object, required: true })
const emit = defineEmits(['crear-cliente'])

const showCrearCliente = ref(false)
const pagoInicialOpen = ref(false)
const nuevoCliente = ref({ nombre: '' })
const formRef = ref(null)

// Crear cliente pide solo el nombre: el schema solo exige nombre y
// crearCliente genera el PIN solo si no viene (resto de campos opcionales).
const clienteFields = [
  { name: 'nombre', label: 'Nombre', type: 'text', required: true, placeholder: 'Nombre completo', props: { class: 'w-full', maxlength: 100 } }
]

function onProductoChange(item) {
  const prod = props.productosActivos.find(p => p.id === item.productoId)
  if (prod) item.precioVentaUsado = prod.precioVentaActual
}

function onCantidadChange(item) {
  if (!item) return
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
