<template>
  <UCard>
    <template #header>
      <h3 class="font-semibold">
        Regalos y descuentos
      </h3>
    </template>
    <div class="space-y-3 text-sm">
      <div class="flex justify-between">
        <span>Regalos:</span>
        <span class="font-mono">{{ fmtPrecio(montoRegaloCalculado) }}</span>
      </div>
      <div class="flex justify-between">
        <span>Descuentos:</span>
        <span class="font-mono">{{ fmtPrecio(montoDescuentoCalculado) }}</span>
      </div>

      <div v-if="!readonly" class="flex gap-2 pt-2">
        <UButton
          size="sm"
          icon="i-lucide-gift"
          label="Nuevo ajuste"
          @click="nuevaOpen = true"
        />
      </div>

      <template v-if="ajustesDelCuadre.length > 0">
        <UDivider label="Ajustes del día" />
        <ul class="space-y-2">
          <li
            v-for="a in ajustesDelCuadre"
            :key="a.id"
            class="flex items-center justify-between gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-800"
          >
            <div class="min-w-0">
              <p class="truncate font-medium">
                <UBadge :label="a.tipo" :color="a.tipo === 'regalo' ? 'success' : 'warning'" size="xs" />
                {{ nombreProducto(a.productoId) }}
              </p>
              <p class="text-xs text-gray-500">
                {{ a.cantidad }} un. · <span class="font-mono">{{ fmtPrecio(a.monto) }}</span>
                <span v-if="a.clienteId"> · {{ nombreCliente(a.clienteId) }}</span>
              </p>
            </div>
            <div v-if="!readonly" class="flex gap-1">
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-pencil"
                aria-label="Editar ajuste"
                @click="abrirEdicion(a)"
              />
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                aria-label="Eliminar ajuste"
                @click="ajusteAEliminar = a; eliminarOpen = true"
              />
            </div>
          </li>
        </ul>
      </template>
    </div>

    <BaseDialog
      v-model="nuevaOpen"
      title="Nuevo ajuste"
      confirm-text="Registrar"
      :loading="cargando"
      @confirm="confirmarNuevo"
      @cancel="nuevaOpen = false"
    >
      <CuadreAjustesForm
        ref="nuevaFormRef"
        v-model="nuevaForm"
        :productos="productos"
        :clientes="clientes"
        @crear-cliente="onCrearCliente"
      />
    </BaseDialog>

    <BaseDialog
      v-model="editarOpen"
      title="Editar ajuste"
      confirm-text="Guardar"
      :loading="cargando"
      @confirm="confirmarEdicion"
      @cancel="editarOpen = false"
    >
      <CuadreAjustesForm
        ref="editarFormRef"
        v-model="editarForm"
        :productos="productos"
        :clientes="clientes"
      />
    </BaseDialog>

    <BaseDialog
      v-model="eliminarOpen"
      title="Eliminar ajuste"
      confirm-text="Eliminar"
      confirm-color="error"
      :loading="cargando"
      @confirm="confirmarEliminar"
      @cancel="eliminarOpen = false"
    >
      <p class="text-sm">
        Se eliminará el ajuste de <strong>{{ ajusteAEliminar ? nombreProducto(ajusteAEliminar.productoId) : '' }}</strong>
        y se revertirá su monto del cuadre.
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
  clientes, productos, cargando, ajustesDelCuadre,
  montoRegaloCalculado, montoDescuentoCalculado,
  cargarClientes, cargarProductos, cargarActividadDelCuadre, crearCliente,
  registrarAjuste, editarAjuste, eliminarAjuste,
  nombreProducto, nombreCliente
} = useAjustes()

const nuevaOpen = ref(false)
const editarOpen = ref(false)
const eliminarOpen = ref(false)
const nuevaForm = ref({ clienteId: null, productoId: '', tipo: 'regalo', cantidad: 0, monto: 0, nota: null })
const editarForm = ref({ clienteId: null, productoId: '', tipo: 'regalo', cantidad: 0, monto: 0, nota: null })
const editarAjusteId = ref(null)
const ajusteAEliminar = ref(null)
const nuevaFormRef = ref(null)
const editarFormRef = ref(null)

const emit = defineEmits(['actualizado'])

onMounted(async () => {
  await cargarClientes(props.puestoId)
  await cargarProductos(props.puestoId)
  await cargarActividadDelCuadre(props.cuadreId)
})

async function onCrearCliente(data) {
  const nuevo = await crearCliente(data, props.puestoId)
  nuevaForm.value.clienteId = nuevo.id
}

function abrirEdicion(a) {
  editarAjusteId.value = a.id
  editarForm.value = {
    clienteId: a.clienteId ?? null,
    productoId: a.productoId,
    tipo: a.tipo,
    cantidad: Number(a.cantidad) || 0,
    monto: Number(a.monto) || 0,
    nota: a.nota ?? null
  }
  editarOpen.value = true
}

async function confirmarNuevo() {
  const f = nuevaForm.value
  if (!f.productoId || Number(f.cantidad) <= 0) return
  await registrarAjuste({
    cuadreId: props.cuadreId,
    clienteId: f.clienteId ?? null,
    productoId: f.productoId,
    tipo: f.tipo,
    cantidad: Number(f.cantidad) || 0,
    monto: Number(f.monto) || 0,
    nota: f.nota ?? null,
    puestoId: props.puestoId
  })
  nuevaOpen.value = false
  nuevaForm.value = { clienteId: null, productoId: '', tipo: 'regalo', cantidad: 0, monto: 0, nota: null }
  emit('actualizado')
}

async function confirmarEdicion() {
  const f = editarForm.value
  if (!f.productoId || Number(f.cantidad) <= 0) return
  await editarAjuste({
    ajusteId: editarAjusteId.value,
    cuadreId: props.cuadreId,
    cambios: {
      clienteId: f.clienteId ?? null,
      productoId: f.productoId,
      tipo: f.tipo,
      cantidad: Number(f.cantidad) || 0,
      monto: Number(f.monto) || 0,
      nota: f.nota ?? null
    }
  })
  editarOpen.value = false
  emit('actualizado')
}

async function confirmarEliminar() {
  const id = ajusteAEliminar.value?.id
  ajusteAEliminar.value = null
  eliminarOpen.value = false
  if (!id) return
  await eliminarAjuste(id, props.cuadreId)
  emit('actualizado')
}
</script>
