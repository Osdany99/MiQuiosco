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
  puestoId: { type: String, required: true },
  readonly: { type: Boolean, default: false }
})

const {
  clientes, cargando, transferenciasDelCuadre,
  montoTransferenciaCalculado,
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarTransferencia, editarTransferencia, eliminarTransferencia
} = useTransferencias()

const toast = useToast()
const nuevaOpen = ref(false)
const editarOpen = ref(false)
const eliminarOpen = ref(false)
const nuevaForm = ref({ clienteId: null, monto: 0 })
const editarForm = ref({ clienteId: null, monto: 0 })
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

function abrirEdicion(t) {
  editarTransferenciaId.value = t.id
  editarForm.value = {
    clienteId: t.clienteId,
    monto: Number(t.montoTotal) || 0
  }
  editarOpen.value = true
}

async function confirmarNueva() {
  if (!nuevaForm.value.clienteId) {
    toast.add({ title: 'Error', description: 'Elige el cliente que transfirió.', color: 'error' })
    return
  }
  if (!((Number(nuevaForm.value.monto) || 0) > 0)) {
    toast.add({ title: 'Error', description: 'El monto debe ser mayor que cero.', color: 'error' })
    return
  }
  const r = await registrarTransferencia({ clienteId: nuevaForm.value.clienteId, monto: nuevaForm.value.monto, cuadreId: props.cuadreId, puestoId: props.puestoId })
  // Sin éxito no se cierra: el error ya se avisó y el formulario se conserva.
  if (!r?.ok) return
  nuevaOpen.value = false
  nuevaForm.value = { clienteId: null, monto: 0 }
  emit('actualizado')
}

async function confirmarEdicion() {
  if (!((Number(editarForm.value.monto) || 0) > 0)) {
    toast.add({ title: 'Error', description: 'El monto debe ser mayor que cero.', color: 'error' })
    return
  }
  const r = await editarTransferencia({ transferenciaId: editarTransferenciaId.value, monto: editarForm.value.monto, cuadreId: props.cuadreId })
  if (!r?.ok) return
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
