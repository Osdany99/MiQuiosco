<script setup>
/**
 * Vista previa de los contactos del dispositivo para crear clientes en lote.
 *
 * No crea nada por su cuenta: devuelve qué contactos eligió el jefe y la vista
 * conduce la importación. Al confirmar el diálogo **no se cierra**, porque con
 * ~150 contactos el proceso dura varios segundos: se queda en modo progreso con
 * contador y barra, y al final enseña el resumen. Antes se cerraba y la app se
 * quedaba congelada varios segundos sin dar ninguna señal.
 *
 * Los números ya asignados a otro cliente salen tachados y no se ofrecen: un
 * número pertenece a un solo cliente (es la clave con la que se empareja cada
 * recarga que entra).
 */
import { normalizarTelefono } from '../../utils/parseEtecsaSms'

const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  contactos: { type: Array, default: () => [] },
  cargando: { type: Boolean, default: false },
  /** Números canónicos (10 dígitos) que ya tienen dueño. */
  ocupados: { type: Array, default: () => [] },
  importando: { type: Boolean, default: false },
  /** { hechos, total, clientes, numeros, omitidos } */
  progreso: { type: Object, default: null }
})

const emit = defineEmits(['importar'])

const busqueda = ref('')
const seleccionados = ref([])

watch(abierta, (v) => {
  if (v) {
    busqueda.value = ''
    seleccionados.value = []
  }
})

const items = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return props.contactos
    .map((c) => {
      const numeros = (c.telefonos || [])
        .map(t => normalizarTelefono(t))
        .filter(t => t && t.length === 10)
      const unicos = [...new Set(numeros)]
      return {
        id: c.id,
        nombre: c.nombre || 'Sin nombre',
        nuevos: unicos.filter(t => !props.ocupados.includes(t)),
        repetidos: unicos.filter(t => props.ocupados.includes(t))
      }
    })
    .filter(i => i.nuevos.length > 0)
    .filter(i => !q || i.nombre.toLowerCase().includes(q) || i.nuevos.some(t => t.includes(q)))
})

const seleccionadosIds = computed(() => new Set(seleccionados.value))

const repetidosTotal = computed(() =>
  items.value.reduce((s, i) => s + i.repetidos.length, 0)
)

const porcentaje = computed(() => {
  const p = props.progreso
  if (!p?.total) return 0
  return Math.min(100, Math.round((p.hechos / p.total) * 100))
})

const hayResumen = computed(() => !props.importando && !!props.progreso?.total)

const titulo = computed(() => (hayResumen.value ? 'Importación terminada' : 'Importar contactos'))
const descripcion = computed(() => {
  if (hayResumen.value) return 'Revisa el resultado antes de cerrar.'
  return 'Elige los contactos que quieres convertir en clientes.'
})

function alternar(id) {
  seleccionados.value = seleccionadosIds.value.has(id)
    ? seleccionados.value.filter(x => x !== id)
    : [...seleccionados.value, id]
}

function todosVisibles() {
  const ids = items.value.map(i => i.id)
  seleccionados.value = ids.every(id => seleccionadosIds.value.has(id)) ? [] : ids
}

// No se cierra: la vista lleva la cuenta y luego enseña el resumen.
function confirmar() {
  const elegidos = items.value.filter(i => seleccionadosIds.value.has(i.id))
  if (!elegidos.length) return
  emit('importar', elegidos.map(i => ({ nombre: i.nombre, telefonos: i.nuevos })))
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    :title="titulo"
    :description="descripcion"
    :confirm-text="`Crear ${seleccionados.length || ''} cliente(s)`"
    :loading="importando"
    :hide-confirm="importando || hayResumen"
    :cancel-text="hayResumen ? 'Cerrar' : 'Cancelar'"
    :disabled-guardar="!seleccionados.length"
    @confirm="confirmar"
    @cancel="abierta = false"
  >
    <!-- 1. Leyendo la agenda -->
    <div v-if="cargando" class="flex flex-col items-center gap-2 py-10">
      <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-muted" />
      <p class="text-sm text-muted">
        Leyendo contactos del teléfono...
      </p>
    </div>

    <!-- 2. Importando -->
    <div v-else-if="importando" class="space-y-3">
      <div class="flex items-center justify-between text-sm">
        <span class="font-medium">Importando contactos...</span>
        <span class="font-mono text-xs text-muted">
          {{ progreso?.hechos ?? 0 }} / {{ progreso?.total ?? 0 }}
        </span>
      </div>
      <UProgress
        :model-value="porcentaje"
        size="sm"
      />
      <p class="text-xs text-muted">
        Se procesa por tandas para que la pantalla pueda pintarse. Deja la app
        abierta un momento.
      </p>
      <div class="grid grid-cols-3 gap-2 pt-1 text-center">
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Clientes
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.clientes ?? 0 }}
          </p>
        </div>
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Números
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.numeros ?? 0 }}
          </p>
        </div>
        <div class="rounded-md border border-default p-2">
          <p class="text-xs text-muted">
            Omitidos
          </p>
          <p class="text-sm font-bold font-mono">
            {{ progreso?.omitidos ?? 0 }}
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Resumen final -->
    <div v-else-if="hayResumen" class="space-y-3">
      <UAlert
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        :title="`${progreso.clientes} cliente(s) importados`"
        :description="`${progreso.numeros} número(s) añadidos${progreso.omitidos ? `, ${progreso.omitidos} omitidos por estar ya asignados` : ''}.`"
      />
      <p class="text-xs text-muted">
        La próxima vez que abras esta pantalla solo aparecerán los contactos con
        números nuevos, así que no se duplica nada.
      </p>
    </div>

    <!-- 4. Vista previa -->
    <div v-else class="space-y-3">
      <UInput
        v-model="busqueda"
        icon="i-lucide-search"
        placeholder="Buscar por nombre o número"
        class="w-full"
      />

      <div class="flex items-center justify-between text-xs text-muted">
        <span>
          {{ items.length }} con números libres
          <template v-if="repetidosTotal">
            · {{ repetidosTotal }} ya asignados
          </template>
        </span>
        <UButton
          v-if="items.length"
          size="xs"
          variant="ghost"
          color="neutral"
          :label="seleccionados.length === items.length ? 'Quitar todos' : 'Elegir todos'"
          @click="todosVisibles"
        />
      </div>

      <UAlert
        v-if="!items.length"
        color="neutral"
        variant="soft"
        icon="i-lucide-user-x"
        title="Nada que importar"
        description="No hay contactos con números que no estén ya asignados."
      />

      <div
        v-else
        class="max-h-80 overflow-y-auto divide-y divide-default rounded-lg border border-default"
      >
        <label
          v-for="i in items"
          :key="i.id"
          class="flex items-start gap-3 p-3 cursor-pointer hover:bg-elevated/40"
        >
          <UCheckbox
            :model-value="seleccionadosIds.has(i.id)"
            class="mt-0.5"
            @update:model-value="alternar(i.id)"
          />
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-medium truncate">
              {{ i.nombre }}
            </span>
            <span class="mt-1 flex flex-wrap gap-1">
              <UBadge
                v-for="t in i.nuevos"
                :key="t"
                variant="soft"
                size="sm"
                color="primary"
                class="font-mono"
                :label="t"
              />
              <UBadge
                v-for="t in i.repetidos"
                :key="`r-${t}`"
                variant="outline"
                size="sm"
                color="neutral"
                class="font-mono line-through"
                :label="`${t} ya asignado`"
              />
            </span>
          </span>
        </label>
      </div>
    </div>
  </BaseDialog>
</template>
