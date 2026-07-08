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
  clientes, cargando,
  montoFiadoCalculado, montoCobradoFiadoCalculado,
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarNuevaDeuda, cobrarDeuda
} = useCuentasFiado()

const nuevaDeudaOpen = ref(false)
const cobrarOpen = ref(false)
const fiadoForm = ref({ clienteId: null, items: [], montoPagadoInicial: 0, formaPagoInicial: 'efectivo' })
const cobrarForm = ref({ cuentaFiadoId: null, monto: 0, formaPago: 'efectivo' })
const fiadoFormRef = ref(null)
const cobrarFormRef = ref(null)

const emit = defineEmits(['actualizado'])

onMounted(async () => {
  await cargarClientes(props.puestoId)
  await cargarActividadDelCuadre(props.cuadreId)
})

async function onCrearCliente(nombre) {
  const nuevo = await crearCliente(nombre, props.puestoId)
  fiadoForm.value.clienteId = nuevo.id
}

async function confirmarNuevaDeuda() {
  await registrarNuevaDeuda({ ...fiadoForm.value, cuadreId: props.cuadreId })
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
</script>
