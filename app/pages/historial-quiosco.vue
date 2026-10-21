<script setup>
import {
  cargarHistorialQuiosco, columnasDeMes, nombreMes, mesPorDefecto
} from '../../app/utils/historialQuiosco'
import { limpiarCacheLibro } from '../../app/utils/libro'

definePageMeta({ middleware: ['jefe'] })

const toast = useToast()

// Filtros APLICADOS: los que la tabla está mostrando.
const mes = ref('')
const busqueda = ref('')
const soloConActividad = ref(false)

// Filtros del popover: se editan ahí y solo cuentan cuando se pulsa "Aplicar".
// Así el jefe teclea el nombre de un producto sin que la tabla se recalcule en
// cada tecla.
const filtrosAbiertos = ref(false)
const borrador = reactive({
  mes: '',
  busqueda: '',
  soloConActividad: false
})

const cargando = ref(true)
const error = ref(null)
const filas = ref([])
const meses = ref([])

const columnas = computed(() => (mes.value ? columnasDeMes(mes.value) : []))

// Los meses que tienen datos, como 'YYYY-MM' (el selector usa { value, label }).
const mesesDisponibles = computed(() => meses.value.map(m => m.value))

// Filtros con efecto real: el mes no cuenta porque siempre tiene un valor
// (si contara, el botón marcaría "1" aunque no haya nada filtrado).
const filtrosActivos = computed(() =>
  (busqueda.value.trim() ? 1 : 0) + (soloConActividad.value ? 1 : 0))

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

// Al abrir el popover, el borrador arranca en lo que hay en pantalla: si se
// cancela, la vista no se movió.
watch(filtrosAbiertos, (abierto) => {
  if (!abierto) return
  borrador.mes = mes.value
  borrador.busqueda = busqueda.value
  borrador.soloConActividad = soloConActividad.value
})

async function aplicarFiltros() {
  mes.value = borrador.mes
  busqueda.value = borrador.busqueda
  soloConActividad.value = borrador.soloConActividad
  filtrosAbiertos.value = false
  await cargar()
}

// Limpiar deja la vista como estaba al entrar: el mes que toca por defecto,
// sin búsqueda y sin el switch de movimientos.
async function limpiarFiltros() {
  mes.value = mesPorDefecto(mesesDisponibles.value)
  busqueda.value = ''
  soloConActividad.value = false
  filtrosAbiertos.value = false
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
    <template #badge>
      <UBadge
        v-if="mes"
        color="neutral"
        variant="soft"
        class="text-sm font-medium first-letter:uppercase"
      >
        {{ nombreMes(mes) }}
      </UBadge>
    </template>

    <template #trailing>
      <div class="flex flex-wrap items-center gap-2">
        <UPopover v-model:open="filtrosAbiertos">
          <UButton
            icon="i-lucide-filter"
            color="neutral"
            variant="outline"
            size="sm"
            label="Filtrar"
          >
            <!-- UButton de Nuxt UI v4 no tiene prop "badge": el contador va en
                 el slot trailing para que se vea de verdad. -->
            <template v-if="filtrosActivos" #trailing>
              <UBadge
                color="primary"
                variant="solid"
                size="sm"
                :label="filtrosActivos"
                class="rounded-full px-1.5"
              />
            </template>
          </UButton>
          <template #content>
            <div class="w-72 space-y-3 p-1">
              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-muted">Mes</label>
                <USelectMenu
                  v-model="borrador.mes"
                  :items="meses"
                  value-key="value"
                  label-key="label"
                  class="flex-1"
                  :search-input="false"
                  :disabled="!meses.length"
                />
              </div>
              <div class="flex items-center gap-2">
                <label class="w-16 shrink-0 text-xs text-muted">Producto</label>
                <UInput
                  v-model="borrador.busqueda"
                  icon="i-lucide-search"
                  placeholder="Buscar producto"
                  class="flex-1"
                />
              </div>
              <div class="flex items-center justify-between gap-2">
                <label class="text-xs text-muted">Solo con movimientos</label>
                <USwitch v-model="borrador.soloConActividad" />
              </div>
              <div class="flex items-center justify-between gap-2 border-t border-default pt-2">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  label="Limpiar"
                  @click="limpiarFiltros"
                />
                <div class="flex gap-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    label="Cancelar"
                    @click="filtrosAbiertos = false"
                  />
                  <UButton
                    size="xs"
                    color="primary"
                    label="Aplicar"
                    @click="aplicarFiltros"
                  />
                </div>
              </div>
            </div>
          </template>
        </UPopover>

        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="cargando"
          :disabled="cargando"
          aria-label="Recargar"
          @click="recargar"
        />
      </div>
    </template>

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
