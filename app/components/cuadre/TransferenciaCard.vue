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
        <span class="font-mono">{{ fmtPrecio(montoTransferencia) }}</span>
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
        <USeparator label="Registros del día" />
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
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarTransferencia, eliminarTransferencia
} = useTransferencias()

// El total sale del cuadre, no de sumar las filas de la lista: el abono inicial
// de una deuda pagada por transferencia entra a la gaveta del cuadre SIN crear
// fila aquí (ver useCuentasFiado.registrarNuevaDeuda), así que la suma de las
// filas se quedaría corta y la tarjeta y el resumen de la derecha enseñarían
// números distintos en la misma pantalla.
const { montoTransferencia } = useCuadre()

const toast = useToast()
const nuevaOpen = ref(false)
const eliminarOpen = ref(false)
const nuevaForm = ref({ clienteId: null, monto: 0 })
const transferenciaAEliminar = ref(null)
const nuevaFormRef = ref(null)

const emit = defineEmits(['actualizado'])

function nombreCliente(clienteId) {
  return clientes.value.find(c => c.id === clienteId)?.nombre ?? 'Cliente'
}

// Única tarjeta que ofrece el cliente centinela: una transferencia puede no
// tener cliente conocido (se olvidó quién fue), y ahí "Sin cliente" es la
// respuesta honesta. En las demás (fiado, ajustes, recargas) no tiene sentido.
onMounted(() => {
  void cargarClientes(props.puestoId, { incluirSinCliente: true })
})

// Ver FiadoCard: la tarjeta monta antes de que la página resuelva el cuadre, así
// que cuadreId llega '' y con onMounted la lista nunca llegaba a cargar.
watch(() => props.cuadreId, async (id) => {
  if (!id) return
  await cargarActividadDelCuadre(id)
}, { immediate: true })

async function onCrearCliente(data) {
  const nuevo = await crearCliente(data, props.puestoId)
  nuevaForm.value.clienteId = nuevo.id
}

async function confirmarNueva() {
  // El cliente no se valida aquí: la lista incluye el centinela "Sin cliente",
  // así que un valor no elegido es indistinguible de "no sé de quién era".
  // Si el jefe no eligió ninguno, registrarTransferencia lo rechaza.
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

async function confirmarEliminar() {
  const id = transferenciaAEliminar.value?.id
  transferenciaAEliminar.value = null
  eliminarOpen.value = false
  if (!id) return
  await eliminarTransferencia(id, props.cuadreId)
  emit('actualizado')
}
</script>
