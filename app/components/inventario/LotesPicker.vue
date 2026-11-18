<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between gap-2">
      <div class="min-w-0">
        <span class="text-sm font-medium">Lotes a usar</span>
        <div class="text-xs text-muted truncate">
          {{ resumenLotes }} · pedido: {{ Math.trunc(Number(props.cantidad) || 0) }}
        </div>
      </div>
      <UButton
        size="xs"
        variant="soft"
        color="neutral"
        :disabled="!lotesConSaldo.length"
        @click="expandido = !expandido"
      >
        {{ expandido ? 'Cerrar' : 'Ajustar' }}
      </UButton>
    </div>

    <p v-if="!lotesConSaldo.length" class="text-xs text-muted">
      No hay lotes con stock.
    </p>

    <div v-show="expandido && lotesConSaldo.length" class="space-y-3 pt-1">
      <div class="flex items-center gap-2">
        <UBadge size="sm" :color="autoCalc ? 'primary' : 'neutral'" variant="soft">
          {{ autoCalc ? 'FIFO automático' : 'Modo manual' }}
        </UBadge>
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          @click="toggleAuto"
        >
          {{ autoCalc ? 'Cambiar a manual' : 'Volver a FIFO auto' }}
        </UButton>
      </div>

      <!-- Auto: el orden lo pone la antigüedad, solo se muestra. -->
      <ul v-if="autoCalc" class="space-y-2">
        <li
          v-for="(lote, idx) in ordenAuto"
          :key="lote.id"
          class="flex items-center gap-2 rounded-md border p-2"
        >
          <UBadge
            size="sm"
            color="neutral"
            variant="soft"
            class="shrink-0"
          >
            #{{ idx + 1 }}
          </UBadge>
          <div class="min-w-0 flex-1">
            <div class="text-xs text-muted truncate">
              {{ descripcion(lote) }}
            </div>
          </div>
        </li>
      </ul>

      <!--
        Manual: UNA lista con un separador en medio. Arriba se consume (y en
        ese orden); abajo queda fuera. Se arrastra con el handle para meter o
        sacar, sin botones ni números que escribir.
      -->
      <template v-else>
        <p class="text-xs text-muted">
          Arrastra hacia arriba para consumir; hacia abajo, para dejarlo fuera.
        </p>
        <ul ref="lista" class="space-y-2">
          <template
            v-for="el in elementos"
            :key="el.key"
          >
            <li
              v-if="el.tipo === 'divisor'"
              class="divisor flex items-center gap-2 py-1"
            >
              <span class="h-px flex-1 bg-default" />
              <span class="text-xs text-muted">Fuera del consumo</span>
              <span class="h-px flex-1 bg-default" />
            </li>
            <!-- Zona de soltado: solo aparece cuando no hay espacio real. -->
            <li
              v-else-if="el.tipo === 'zona'"
              class="zona rounded-md border border-dashed p-2 text-center text-xs text-muted"
            >
              {{ el.texto }}
            </li>
            <li
              v-else
              :data-id="el.lote.id"
              class="flex items-center gap-2 rounded-md border p-2"
              :class="el.incluido ? '' : 'opacity-60'"
            >
              <UIcon
                name="i-lucide-grip-vertical"
                class="drag-handle size-4 shrink-0 cursor-grab text-muted-foreground"
              />
              <UBadge
                v-if="el.incluido"
                size="sm"
                color="neutral"
                variant="soft"
                class="shrink-0"
              >
                #{{ numeroIncluido(el.lote.id) }}
              </UBadge>
              <div class="min-w-0 flex-1">
                <div class="text-xs text-muted truncate">
                  {{ descripcion(el.lote) }}
                </div>
              </div>
            </li>
          </template>
        </ul>
      </template>

      <div class="text-xs text-muted">
        Se consume por el orden #1, luego #2, etc. Total disponible de los seleccionados:
        <span class="font-medium">{{ totalDisponible }}</span>.
      </div>
      <div v-if="faltante > 0" class="text-xs text-error font-medium">
        Faltan {{ faltante }} unidades; el total disponible de los seleccionados no alcanza.
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import Sortable from 'sortablejs'
import { calcularConsumoLotes } from '../../utils/inventario/consumoLotes'

const props = defineProps({
  lotes: { type: Array, default: () => [] },
  cantidad: { type: Number, default: 1 },
  autoFifo: { type: Boolean, default: true },
  productoNombre: { type: String, default: '' }
})

const emit = defineEmits(['update:consumo', 'update:autoFifo'])

const autoCalc = ref(props.autoFifo)
const expandido = ref(false)

/**
 * Ids en el orden de consumo del modo manual: la ÚNICA fuente de verdad del
 * orden. El `#N` que se pinta es la posición en la lista, así que no puede
 * haber rangos repetidos ni saltos.
 *
 * Antes existían `ranks` y `lotesSeleccionadosOrdered` leyéndose entre sí
 * (`ranks` → `sel` → `ranks`), y Vue cortaba la recursión devolviendo
 * `undefined`: de ahí el "can't access property forEach, sel is undefined" al
 * entrar en manual. También se mutaba `ranks.value[id]`, que es el cache de un
 * computed y se perdía en el siguiente recálculo.
 */
const incluidos = ref([])

const lista = ref(null)
let sortable = null

const lotesConSaldo = computed(() =>
  [...(props.lotes || [])]
    .sort((a, b) => {
      if (a?.fechaEntrada && b?.fechaEntrada) return String(a.fechaEntrada).localeCompare(String(b.fechaEntrada))
      return 0
    })
    .filter(l => (Number(l?.saldo) || 0) > 0)
)

/** Auto: FIFO (más viejo primero), el `#N` sale del índice. */
const ordenAuto = computed(() => lotesConSaldo.value)

const incluidosLotes = computed(() =>
  incluidos.value
    .map(id => lotesConSaldo.value.find(l => l.id === id))
    .filter(Boolean)
)

const disponiblesSinIncluir = computed(() =>
  lotesConSaldo.value.filter(l => !incluidos.value.includes(l.id))
)

/**
 * Lista única del modo manual: [zona arriba] incluidos, separador, no incluidos
 * [zona abajo]. Una sola `<ul>` (en vez de dos listas de Sortable) evita los
 * eventos `onAdd`/`onRemove` cruzados y que Vue y Sortable se peleen por el
 * mismo nodo.
 *
 * Las zonas punteadas solo aparecen cuando su sección está vacía: si no hay
 * ningún lote incluido no habría hueco encima del separador para soltar, y si
 * están todos incluidos no habría hueco debajo. No tienen `data-id`, así que
 * `sincronizarDesdeDom()` los ignora; y como no tienen handle, son solo
 * destino, nunca origen.
 */
const elementos = computed(() => {
  const items = []
  if (!incluidosLotes.value.length) {
    items.push({ tipo: 'zona', key: '__zonaIncluir', texto: 'Suelta aquí para consumirlo' })
  }
  items.push(...incluidosLotes.value.map(lote => ({ tipo: 'lote', key: lote.id, lote, incluido: true })))
  items.push({ tipo: 'divisor', key: '__divisor' })
  items.push(...disponiblesSinIncluir.value.map(lote => ({ tipo: 'lote', key: lote.id, lote, incluido: false })))
  if (!disponiblesSinIncluir.value.length) {
    items.push({ tipo: 'zona', key: '__zonaExcluir', texto: 'Suelta aquí para dejarlo fuera' })
  }
  return items
})

/** `#N` por posición entre los incluidos (no por el índice de `elementos`). */
function numeroIncluido(id) {
  return incluidosLotes.value.findIndex(l => l.id === id) + 1
}

const ordenActual = computed(() => (autoCalc.value ? ordenAuto.value : incluidosLotes.value))

const consumo = computed(() =>
  calcularConsumoLotes(
    ordenActual.value.map(l => ({ id: l.id, saldo: l.saldo })),
    Math.trunc(Number(props.cantidad) || 0)
  )
)

const faltante = computed(() => consumo.value.faltante)

const totalDisponible = computed(() =>
  ordenActual.value.reduce((acc, l) => acc + (Number(l.saldo) || 0), 0)
)

const resumenLotes = computed(() => {
  const lineas = consumo.value.lineas
  if (!lineas.length) return 'Sin lote seleccionado'
  return lineas.map((line, idx) => {
    const l = lotesConSaldo.value.find(x => x.id === line.loteId)
    const etiqueta = l?.fechaEntrada || 'lote'
    return `#${idx + 1} ${etiqueta} (${line.cantidad})`
  }).join(' · ')
})

function descripcion(lote) {
  const partes = [
    lote.fechaEntrada || 'sin fecha',
    formatearPrecio(lote.precioUnitario),
    `disp ${lote.saldo}`
  ]
  if (lote.estadoLote && lote.estadoLote !== 'normal') partes.push(lote.estadoLote)
  return partes.join(' · ')
}

function formatearPrecio(v) {
  return Number(v || 0).toFixed(2)
}

/** Plan FIFO del pedido actual, usado para arrancar el modo manual. */
function planFifo() {
  const ids = calcularConsumoLotes(
    ordenAuto.value.map(l => ({ id: l.id, saldo: l.saldo })),
    Math.trunc(Number(props.cantidad) || 0)
  ).lineas.map(l => l.loteId)
  // Sin cantidad (o sin cubrir nada) igual conviene un punto de partida
  // arrastrable en vez de una lista vacía.
  if (!ids.length && lotesConSaldo.value.length) return [lotesConSaldo.value[0].id]
  return ids
}

/**
 * Después del arrastre la verdad del orden es el DOM: lo que está encima del
 * separador se consume, en ese orden. Con una sola lista keyed, actualizar
 * `incluidos` con esos ids deja los vnodes en el mismo orden que el DOM, así
 * que el patch de Vue no mueve nada (no quedan nodos huérfanos del otro
 * contenedor, que es lo que complica el patrón de dos listas).
 */
function sincronizarDesdeDom() {
  const ul = lista.value
  if (!ul) return
  const ids = []
  for (const el of ul.children) {
    if (el.classList.contains('divisor')) break
    if (el.dataset.id) ids.push(el.dataset.id)
  }
  incluidos.value = ids
}

function toggleAuto() {
  autoCalc.value = !autoCalc.value
}

// ---------------------------------------------------------------- sortable

function destruirSortable() {
  sortable?.destroy()
  sortable = null
}

function initSortable() {
  destruirSortable()
  // Solo en manual y con la lista montada.
  if (autoCalc.value || !lista.value) return
  sortable = new Sortable(lista.value, {
    handle: '.drag-handle',
    // Sortable solo toma como ancla de inserción lo que coincide con
    // `draggable`. Si se limita a '.draggable', el divisor y las zonas no son
    // destino: al soltar ahí Sortable reinserta el lote ANTES del divisor (ver
    // `elLastChild.nextSibling` en _onDragOver) y el lote sigue incluido, así
    // que quitar por arrastre "no hacía nada". Con 'li' cualquier fila es
    // ancla, y el corte en el divisor decide la sección.
    draggable: 'li',
    // …pero el divisor y las zonas no se pueden arrastrar. `filter` solo
    // cancela el INICIO del arrastre sobre ellos, no el drop. Y con
    // `preventOnFilter: false` tocar la zona no bloquea el scroll en táctil.
    filter: '.divisor, .zona',
    preventOnFilter: false,
    animation: 150,
    // Misma configuración que el orden de productos: en táctil exige pulsación
    // larga para que el scroll del diálogo siga funcionando.
    delay: 200,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    scrollSensitivity: 60,
    direction: 'vertical',
    ghostClass: 'opacity-40',
    onEnd: sincronizarDesdeDom
  })
}

function sincronizarSortable() {
  if (expandido.value && !autoCalc.value && lista.value) {
    if (!sortable) initSortable()
  } else {
    destruirSortable()
  }
}

watch(autoCalc, (auto) => {
  emit('update:autoFifo', auto)
  if (auto) {
    incluidos.value = []
    return
  }
  // Pasar a manual arranca con lo que el FIFO consumiría: la vista previa no
  // cambia y solo se ajusta si se quiere.
  incluidos.value = planFifo()
}, { immediate: true })

watch(() => props.autoFifo, (v) => {
  autoCalc.value = v
})

// Al cargarse los lotes de otra operación se vuelve al modo por defecto (el
// diálogo se reutiliza; sin esto el modo manual sobrevivía de una venta a la
// siguiente). Hoy los dos consumidores dejan `autoFifo` en true → FIFO.
watch(() => props.lotes, () => {
  autoCalc.value = props.autoFifo
  incluidos.value = props.autoFifo ? [] : planFifo()
  destruirSortable()
})

watch([expandido, autoCalc], () => nextTick(sincronizarSortable))

watch(consumo, plan => emit('update:consumo', plan), { immediate: true })

onBeforeUnmount(() => destruirSortable())
</script>
