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

      <p
        v-if="deudasActivas.length === 0"
        class="text-xs text-muted"
      >
        Para fiar, usa el botón de la fila del producto en la tabla de líneas.
      </p>

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
              <!-- Qué se fió. La fila solo decía "pendiente" y el saldo: con
                   varias deudas del día no había forma de saber cuál era cuál ni
                   de qué producto hablaba. -->
              <p
                v-if="resumenItems(deuda)"
                class="truncate text-xs text-muted"
              >
                {{ resumenItems(deuda) }}
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
      :title="productoFijo ? `Fiar ${productoFijo.nombre}` : 'Nueva deuda'"
      confirm-text="Registrar"
      :loading="cargando"
      @confirm="confirmarNuevaDeuda"
      @cancel="cerrarNuevaDeuda"
    >
      <CuadreFiadoForm
        ref="fiadoFormRef"
        v-model="fiadoForm"
        :productos-activos="productosActivos"
        :clientes="clientes"
        :producto-fijo="productoFijo"
        @crear-cliente="onCrearCliente"
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
        Se eliminará la deuda de <strong>{{ deudaAEliminar ? nombreCliente(deudaAEliminar.clienteId) : '' }}</strong>.
      </p>
      <p class="mt-2 text-sm text-muted">
        {{ cuadreYaCerrado
          ? 'Su cuadre del día ya está cerrado: el dinero y la venta se quedan como están, solo se borra el registro de la deuda.'
          : 'Volverán a su sitio los montos del cuadre de ese día: el saldo pendiente que estaba en fiado y, si el abono inicial se pagó por transferencia, ese monto en transferencia.' }}
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
  montoFiadoCalculado,
  cargarClientes, cargarActividadDelCuadre, crearCliente,
  registrarNuevaDeuda, eliminarDeuda
} = useCuentasFiado()

const nuevaDeudaOpen = ref(false)
const eliminarOpen = ref(false)
const FIADO_VACIO = () => ({
  clienteId: null,
  items: [],
  montoPagadoInicial: 0,
  formaPagoInicial: 'efectivo'
})
const fiadoForm = ref(FIADO_VACIO())
/**
 * Producto cerrado de la deuda que se va a registrar. La fija la fila de la
 * tabla de líneas (ver abrirNuevaDeuda): sin esto, el fiado se declaraba
 * desde aquí con un selector libre de producto y cualquier cantidad.
 */
const productoFijo = ref(null)
const deudaAEliminar = ref(null)
const fiadoFormRef = ref(null)

const emit = defineEmits(['actualizado'])
const toast = useToast()

const deudasActivas = computed(() =>
  cuentasDelCuadre.value.filter(c => c.estado !== 'pagada')
)

/**
 * Un cuadre cerrado es historia: sus montos no se reescriben, así que borrar una
 * deuda de ese día quita el registro pero NO devuelve nada al cuadre. El aviso
 * del diálogo depende de esto para no prometer una reversión que no ocurre.
 */
const cuadreYaCerrado = computed(() => props.readonly)

function nombreCliente(clienteId) {
  return clientes.value.find(c => c.id === clienteId)?.nombre ?? 'Cliente'
}

function nombreProducto(productoId) {
  return props.productosActivos.find(p => p.id === productoId)?.nombre ?? 'Producto'
}

/** "Aceite ×1", o "Aceite ×2, Sal ×1" si la deuda trae varias líneas. */
function resumenItems(cuenta) {
  return (cuenta.items ?? [])
    .map(it => `${nombreProducto(it.productoId)} ×${Number(it.cantidad) || 0}`)
    .join(', ')
}

onMounted(() => {
  void cargarClientes(props.puestoId)
})

// El cuadre se carga de forma asíncrona y esta tarjeta monta ANTES de que la
// página lo resuelva (en Vue el onMounted de un hijo corre antes que el del
// padre), así que cuadreId llega ''. Con onMounted esa lectura se quedaba fija
// para siempre y la lista salía vacía aunque hubiera datos: el jefe veía el
// monto del fiado en la tarjeta de arriba pero no tenía ninguna deuda que
// borrar — y como el borrado solo existe en esta tarjeta, quedaba sin salida.
// El watch con immediate cubre el primer render y además recargar si el cuadre
// cambia (reabrir, cambio de día).
watch(() => props.cuadreId, async (id) => {
  if (!id) return
  await cargarActividadDelCuadre(id)
}, { immediate: true })

async function onCrearCliente(data) {
  const nuevo = await crearCliente(data, props.puestoId)
  fiadoForm.value.clienteId = nuevo.id
}

/**
 * Abre el formulario de deuda con el producto YA decidido por la fila del
 * cuadre. El precio es el de esa línea (lo que se cobró), no el del catálogo:
 * en una duplicada son distintos y el fiado tiene que ir a lo que el cliente
 * vio. La página (cuadre.vue) es quien llama a esto desde la tabla de líneas.
 */
function abrirNuevaDeuda(linea) {
  const prod = props.productosActivos.find(p => p.id === linea.productoId)
  const precio = Number(linea.precioVentaUsado) || Number(prod?.precioVentaActual) || 0
  productoFijo.value = {
    productoId: linea.productoId,
    nombre: prod?.nombre ?? 'Producto',
    descripcion: prod?.descripcion ?? '',
    precio
  }
  // Un único ítem, ya fijado: el formulario no deja cambiarlo ni añadir más.
  fiadoForm.value = {
    ...FIADO_VACIO(),
    items: [{ productoId: linea.productoId, cantidad: 0, precioVentaUsado: precio }]
  }
  nuevaDeudaOpen.value = true
}

function cerrarNuevaDeuda() {
  nuevaDeudaOpen.value = false
  productoFijo.value = null
  fiadoForm.value = FIADO_VACIO()
}

async function confirmarNuevaDeuda() {
  const form = fiadoForm.value
  if (!form.clienteId) {
    toast.add({ title: 'Error', description: 'Elige el cliente que debe.', color: 'error' })
    return
  }
  const lineas = form.items
    .filter(i => i.productoId && Number(i.cantidad) > 0)
    .map((i, idx) => ({
      productoId: i.productoId,
      cantidad: Math.trunc(Number(i.cantidad) || 0),
      precioVentaUsado: Number(i.precioVentaUsado) || 0,
      secuencia: idx
    }))
  if (lineas.length === 0) {
    toast.add({
      title: 'Error',
      description: productoFijo.value
        ? 'Indica la cantidad a fiar.'
        : 'Agrega al menos un producto.',
      color: 'error'
    })
    return
  }

  // Toda deuda creada aquí nace del cuadre del día (las directas, fuera del
  // cuadre, se crean desde la vista de Deudas).
  const r = await registrarNuevaDeuda({ ...form, cuadreId: props.cuadreId, puestoId: props.puestoId })
  if (!r?.ok) return
  cerrarNuevaDeuda()
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

// La tabla de líneas no puede abrir el formulario por su cuenta (el formulario,
// los clientes y la confirmación viven aquí): la página le pasa la fila pulsada.
defineExpose({ abrirNuevaDeuda })
</script>
