<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        Fiado del día
      </h3>
    </template>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between">
        <span>Fiado nuevo generado:</span>
        <span class="font-mono">{{ fmtPrecio(montoFiadoCalculado) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Cobrado hoy (deudas viejas):</span>
        <span class="font-mono">{{ fmtPrecio(montoCobradoFiadoCalculado) }}</span>
      </div>

      <div v-if="!readonly" class="flex gap-2 pt-2">
        <UButton
          size="sm"
          icon="i-lucide-user-plus"
          label="Nueva deuda"
          @click="nuevaDeudaOpen = true"
        />
        <UButton
          size="sm"
          variant="outline"
          icon="i-lucide-hand-coins"
          label="Cobrar deuda"
          @click="cobrarOpen = true"
        />
      </div>

      <template v-if="deudasActivas.length > 0">
        <UDivider label="Deudas del día" />
        <ul class="space-y-2">
          <li
            v-for="deuda in deudasActivas"
            :key="deuda.id"
            class="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">
                {{ nombreCliente(deuda.clienteId) }}
              </p>
              <p class="text-xs text-gray-500">
                Saldo: <span class="font-mono">{{ fmtPrecio(Number(deuda.montoTotal) - Number(deuda.montoPagado)) }}</span>
                <UBadge
                  v-if="deuda.estado === 'parcial'"
                  label="parcial"
                  color="warning"
                  size="xs"
                />
                <UBadge
                  v-if="deuda.estado === 'pendiente'"
                  label="pendiente"
                  color="info"
                  size="xs"
                />
              </p>
            </div>
            <div v-if="!readonly" class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-pencil"
                aria-label="Editar deuda"
                @click="abrirEdicion(deuda)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                aria-label="Eliminar deuda"
                @click="deudaAEliminar = deuda; eliminarOpen = true"
              />
            </div>
          </li>
        </ul>
      </template>
    </div>

    <BaseDialog
      v-model="nuevaDeudaOpen"
      title="Nueva deuda"
      confirm-text="Registrar"
      :loading="cargando"
      @confirm="confirmarNuevaDeuda"
      @cancel="nuevaDeudaOpen = false"
    >
      <CuadreFiadoForm
        ref="fiadoFormRef"
        v-model="fiadoForm"
        :productos-activos="productosActivos"
        :clientes="clientes"
        @crear-cliente="onCrearCliente"
      />
    </BaseDialog>

    <BaseDialog
      v-model="cobrarOpen"
      title="Cobrar deuda"
      confirm-text="Registrar pago"
      :loading="cargando"
      @confirm="confirmarCobro"
      @cancel="cobrarOpen = false"
    >
      <CuadreCobrarDeudaForm ref="cobrarFormRef" v-model="cobrarForm" />
    </BaseDialog>

    <BaseDialog
      v-model="editarOpen"
      title="Editar deuda"
      confirm-text="Guardar"
      :loading="cargando"
      @confirm="confirmarEdicion"
      @cancel="editarOpen = false"
    >
      <CuadreFiadoForm
        ref="editarFormRef"
        v-model="editarForm"
        :productos-activos="productosActivos"
        :clientes="clientes"
        editar
      />
    </BaseDialog>

    <BaseDialog
      v-model="eliminarOpen"
      title="Eliminar deuda"
      confirm-text="Eliminar"
      confirm-color="error"
      :loading="cargando"
      @confirm="confirmarEliminar"
      @cancel="eliminarOpen = false"
    >
      <p class="text-sm">
        Se eliminará la deuda de <strong>{{ deudaAEliminar ? nombreCliente(deudaAEliminar.clienteId) : '' }}</strong>
        y se revertirán sus cantidades del cuadre.
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
  clientes, cargando, cuentasDelCuadre,
  montoFiadoCalculado, montoCobradoFiadoCalculado,
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarNuevaDeuda, editarDeuda, eliminarDeuda, cobrarDeuda,
  itemsDeCuenta
} = useCuentasFiado()

const nuevaDeudaOpen = ref(false)
const cobrarOpen = ref(false)
const editarOpen = ref(false)
const eliminarOpen = ref(false)
const fiadoForm = ref({ clienteId: null, items: [], montoPagadoInicial: 0, formaPagoInicial: 'efectivo' })
const cobrarForm = ref({ cuentaFiadoId: null, monto: 0, formaPago: 'efectivo' })
const editarForm = ref({ clienteId: null, items: [] })
const editarCuentaId = ref(null)
const deudaAEliminar = ref(null)
const fiadoFormRef = ref(null)
const cobrarFormRef = ref(null)
const editarFormRef = ref(null)

const emit = defineEmits(['actualizado'])

const deudasActivas = computed(() =>
  cuentasDelCuadre.value.filter(c => c.estado !== 'pagada')
)

function nombreCliente(clienteId) {
  return clientes.value.find(c => c.id === clienteId)?.nombre ?? 'Cliente'
}

onMounted(async () => {
  await cargarClientes(props.puestoId)
  await cargarActividadDelCuadre(props.cuadreId)
})

async function onCrearCliente(data) {
  const nuevo = await crearCliente(data, props.puestoId)
  fiadoForm.value.clienteId = nuevo.id
}

async function abrirEdicion(deuda) {
  editarCuentaId.value = deuda.id
  const items = await itemsDeCuenta(deuda.id)
  editarForm.value = {
    clienteId: deuda.clienteId,
    items: items.map(i => ({
      productoId: i.productoId,
      cantidad: Number(i.cantidad) || 0,
      precioVentaUsado: Number(i.precioVentaUsado) || 0
    }))
  }
  editarOpen.value = true
}

async function confirmarNuevaDeuda() {
  await registrarNuevaDeuda({ ...fiadoForm.value, cuadreId: props.cuadreId, puestoId: props.puestoId })
  nuevaDeudaOpen.value = false
  fiadoForm.value = { clienteId: null, items: [], montoPagadoInicial: 0, formaPagoInicial: 'efectivo' }
  emit('actualizado')
}

async function confirmarCobro() {
  await cobrarDeuda({ ...cobrarForm.value, cuadreId: props.cuadreId })
  cobrarOpen.value = false
  cobrarForm.value = { cuentaFiadoId: null, monto: 0, formaPago: 'efectivo' }
  emit('actualizado')
}

async function confirmarEdicion() {
  const items = editarForm.value.items
    .filter(i => i.productoId)
    .map(i => ({
      productoId: i.productoId,
      cantidad: Number(i.cantidad) || 0,
      precioVentaUsado: Number(i.precioVentaUsado) || 0
    }))
  if (items.length === 0) return
  await editarDeuda({ cuentaFiadoId: editarCuentaId.value, items, cuadreId: props.cuadreId })
  editarOpen.value = false
  emit('actualizado')
}

async function confirmarEliminar() {
  const id = deudaAEliminar.value?.id
  deudaAEliminar.value = null
  eliminarOpen.value = false
  if (!id) return
  await eliminarDeuda(id, props.cuadreId)
  emit('actualizado')
}
</script>
