<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        Transferencias del día
      </h3>
    </template>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between">
        <span>En transferencia:</span>
        <span class="font-mono">{{ fmtPrecio(montoTransferenciaCalculado) }}</span>
      </div>

      <div v-if="!readonly" class="flex gap-2 pt-2">
        <UButton
          size="sm"
          icon="i-lucide-arrow-right-left"
          label="Nueva transferencia"
          @click="nuevaOpen = true"
        />
      </div>

      <template v-if="transferenciasDelCuadre.length > 0">
        <UDivider label="Registros del día" />
        <ul class="space-y-2">
          <li
            v-for="t in transferenciasDelCuadre"
            :key="t.id"
            class="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ nombreCliente(t.clienteId) }}
              </p>
              <p class="text-xs text-gray-500">
                Monto: <span class="font-mono">{{ fmtPrecio(t.montoTotal) }}</span>
              </p>
            </div>
            <div v-if="!readonly" class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-pencil"
                aria-label="Editar transferencia"
                @click="abrirEdicion(t)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                aria-label="Eliminar transferencia"
                @click="transferenciaAEliminar = t; eliminarOpen = true"
              />
            </div>
          </li>
        </ul>
      </template>
    </div>

    <BaseDialog
      v-model="nuevaOpen"
      title="Nueva transferencia"
      confirm-text="Registrar"
      :loading="cargando"
      @confirm="confirmarNueva"
      @cancel="nuevaOpen = false"
    >
      <CuadreTransferenciaForm
        ref="nuevaFormRef"
        v-model="nuevaForm"
        :productos-activos="productosActivos"
        :clientes="clientes"
        @crear-cliente="onCrearCliente"
      />
    </BaseDialog>

    <BaseDialog
      v-model="editarOpen"
      title="Editar transferencia"
      confirm-text="Guardar"
      :loading="cargando"
      @confirm="confirmarEdicion"
      @cancel="editarOpen = false"
    >
      <CuadreTransferenciaForm
        ref="editarFormRef"
        v-model="editarForm"
        :productos-activos="productosActivos"
        :clientes="clientes"
        editar
      />
    </BaseDialog>

    <BaseDialog
      v-model="eliminarOpen"
      title="Eliminar transferencia"
      confirm-text="Eliminar"
      confirm-color="error"
      :loading="cargando"
      @confirm="confirmarEliminar"
      @cancel="eliminarOpen = false"
    >
      <p class="text-sm">
        Se eliminará la transferencia de <strong>{{ transferenciaAEliminar ? nombreCliente(transferenciaAEliminar.clienteId) : '' }}</strong>
        por {{ transferenciaAEliminar ? fmtPrecio(transferenciaAEliminar.montoTotal) : 0 }} y se restará del monto en transferencia del cuadre.
      </p>
    </BaseDialog>
  </UCard>
</template>

<script setup>
const props = defineProps({
  cuadreId: { type: String, required: true },
  productosActivos: { type: Array, default: () => [] },
  puestoId: { type: String, required: true },
  readonly: { type: Boolean, default: false }
})

const {
  clientes, cargando, transferenciasDelCuadre,
  montoTransferenciaCalculado,
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarTransferencia, editarTransferencia, eliminarTransferencia,
  itemsDeTransferencia
} = useTransferencias()

const nuevaOpen = ref(false)
const editarOpen = ref(false)
const eliminarOpen = ref(false)
const nuevaForm = ref({ clienteId: null, items: [] })
const editarForm = ref({ clienteId: null, items: [] })
const editarTransferenciaId = ref(null)
const transferenciaAEliminar = ref(null)
const nuevaFormRef = ref(null)
const editarFormRef = ref(null)

const emit = defineEmits(['actualizado'])

function nombreCliente(clienteId) {
  return clientes.value.find(c => c.id === clienteId)?.nombre ?? 'Cliente'
}

onMounted(async () => {
  await cargarClientes(props.puestoId)
  await cargarActividadDelCuadre(props.cuadreId)
})

async function onCrearCliente(data) {
  const nuevo = await crearCliente(data, props.puestoId)
  nuevaForm.value.clienteId = nuevo.id
}

async function abrirEdicion(t) {
  editarTransferenciaId.value = t.id
  const items = await itemsDeTransferencia(t.id)
  editarForm.value = {
    clienteId: t.clienteId,
    items: items.map(i => ({
      productoId: i.productoId,
      cantidad: Number(i.cantidad) || 0,
      precioVentaUsado: Number(i.precioVentaUsado) || 0
    }))
  }
  editarOpen.value = true
}

function armarItems(form) {
  return form.items
    .filter(i => i.productoId && Number(i.cantidad) > 0)
    .map(i => ({
      productoId: i.productoId,
      cantidad: Number(i.cantidad) || 0,
      precioVentaUsado: Number(i.precioVentaUsado) || 0
    }))
}

async function confirmarNueva() {
  const items = armarItems(nuevaForm.value)
  if (items.length === 0) return
  if (!nuevaForm.value.clienteId) return
  await registrarTransferencia({ ...nuevaForm.value, items, cuadreId: props.cuadreId, puestoId: props.puestoId })
  nuevaOpen.value = false
  nuevaForm.value = { clienteId: null, items: [] }
  emit('actualizado')
}

async function confirmarEdicion() {
  const items = armarItems(editarForm.value)
  if (items.length === 0) return
  await editarTransferencia({ transferenciaId: editarTransferenciaId.value, items, cuadreId: props.cuadreId })
  editarOpen.value = false
  emit('actualizado')
}

async function confirmarEliminar() {
  const id = transferenciaAEliminar.value?.id
  transferenciaAEliminar.value = null
  eliminarOpen.value = false
  if (!id) return
  await eliminarTransferencia(id, props.cuadreId)
  emit('actualizado')
}
</script>
