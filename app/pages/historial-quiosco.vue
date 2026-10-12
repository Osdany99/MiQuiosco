<script setup>
import {
  cargarHistorialQuiosco, columnasDeMes, desplazarMes
} from '../../app/utils/historialQuiosco'
import { limpiarCacheLibro } from '../../app/utils/libro'

definePageMeta({ middleware: ['jefe'] })

const toast = useToast()

const mes = ref('')
const busqueda = ref('')
const soloConActividad = ref(false)

const cargando = ref(true)
const error = ref(null)
const filas = ref([])
const meses = ref([])

const columnas = computed(() => (mes.value ? columnasDeMes(mes.value) : []))

const productosConActividad = computed(
  () => filas.value.filter(f => f.actividad).length
)

// Las flechas llegan hasta el mes actual, que es lo normal cuando el mes nuevo
// acaba de empezar. Los meses sin datos no llegan a ofrecerse en el selector.
const mesActual = new Date().toISOString().slice(0, 7)
const hayMesSiguiente = computed(() => desplazarMes(mes.value, 1) <= mesActual)

async function cargar() {
  cargando.value = true
  error.value = null
  try {
    const datos = await cargarHistorialQuiosco(mes.value, {
      busqueda: busqueda.value,
      soloConActividad: soloConActividad.value
    })
    mes.value = datos.mes
    meses.value = datos.meses
    filas.value = datos.filas
  } catch (e) {
    error.value = e?.message || 'No se pudo cargar el historial.'
    toast.add({
      title: 'No se pudo cargar el historial',
      description: error.value,
      color: 'error'
    })
  } finally {
    cargando.value = false
  }
}

async function irAMes(nuevo) {
  mes.value = nuevo
  await cargar()
}

// El libro está cacheado en memoria: al cambiar de mes no se vuelve a leer, se
// recalcula. Por eso recargar (el botón) sí limpia el caché: si se acaba de
// cerrar un cuadre en otra pantalla, sin eso los números serían los de antes.
async function recargar() {
  limpiarCacheLibro()
  await cargar()
}

onMounted(cargar)
watch(soloConActividad, cargar)

// El desglose es el mismo diálogo que abre el "Q:N" del cuadre. Aquí se le pasa
// el día y el producto, y el `historico` evita que le pida al jefe corregir una
// cantidad de un día que ya pasó.
const dialogoAbierto = ref(false)
const diaElegido = ref(null)
const filaElegida = ref(null)

function abrirDia({ fila, dia }) {
  filaElegida.value = fila
  diaElegido.value = dia
  dialogoAbierto.value = true
}

const datosDialogo = computed(() =>
  (diaElegido.value && filaElegida.value ? filaElegida.value.celdas.get(diaElegido.value) : null) ?? null)

const vendidoDialogo = computed(() => datosDialogo.value?.vendido ?? 0)
</script>

<template>
  <BaseHeaderPage
    title="Historial del quiosco"
    description="Qué le pasó a cada producto en el quiosco, día por día."
    :show-button="false"
  >
    <template #trailing>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="outline"
          size="sm"
          aria-label="Mes anterior"
          @click="irAMes(desplazarMes(mes, -1))"
        />
        <USelectMenu
          v-model="mes"
          :items="meses"
          value-key="value"
          class="w-44"
          :disabled="!meses.length"
          @update:model-value="cargar"
        />
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="outline"
          size="sm"
          aria-label="Mes siguiente"
          :disabled="!hayMesSiguiente"
          @click="irAMes(desplazarMes(mes, 1))"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          loading
          :disabled="cargando"
          aria-label="Recargar"
          @click="recargar"
        />
        <USeparator orientation="vertical" class="mx-1 h-6" />
        <UInput
          v-model="busqueda"
          icon="i-lucide-search"
          placeholder="Buscar producto"
          class="w-48"
          @update:model-value="cargar"
        />
        <USwitch
          v-model="soloConActividad"
          label="Solo con movimientos"
        />
      </div>
    </template>

    <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span class="flex items-center gap-1.5">
        <UIcon name="i-lucide-info" class="size-3.5" />
        Cada número es lo que había para vender ese día. Tócalo para ver de dónde sale.
      </span>
      <span class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-success" />
        Entró mercadería
      </span>
      <span class="flex items-center gap-1.5">
        <span class="size-1.5 rounded-full bg-warning" />
        Salió mercadería
      </span>
      <span v-if="!cargando && filas.length" class="ml-auto">
        {{ filas.length }} {{ filas.length === 1 ? 'producto' : 'productos' }}
        <template v-if="soloConActividad">con movimientos</template>
        <template v-else>, {{ productosConActividad }} con movimientos</template>
      </span>
    </div>

    <CuadreTablaCapacidad
      :filas="filas"
      :columnas="columnas"
      :cargando="cargando"
      :error="error"
      @abrir="abrirDia"
      @recargar="recargar"
    />

    <CuadreDialogoCapacidad
      v-model="dialogoAbierto"
      :datos="datosDialogo"
      :producto="filaElegida"
      :vendido="vendidoDialogo"
      :dia="diaElegido"
      historico
    />
  </BaseHeaderPage>
</template>
