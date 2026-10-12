<template>
  <BaseDialog
    v-model="isOpen"
    :title="titulo"
    :description="subtitulo"
    cancel-text="Cerrar"
    :hide-confirm="true"
    @cancel="isOpen = false"
  >
    <div v-if="datos" class="space-y-3">
      <div class="flex items-center justify-between rounded-md bg-elevated/50 px-3 py-2">
        <span class="text-sm text-muted">Había al empezar el día</span>
        <span class="font-mono text-lg font-semibold">{{ datos.inicial }}</span>
      </div>

      <ol v-if="datos.pasos.length" class="space-y-1">
        <li
          v-for="paso in datos.pasos"
          :key="paso.clave"
          class="rounded-md border border-default px-3 py-2"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="flex items-center gap-2 min-w-0">
              <UIcon
                :name="iconoDe(paso)"
                class="size-4 shrink-0"
                :class="paso.delta > 0 ? 'text-success' : 'text-warning'"
              />
              <span class="text-sm truncate">{{ paso.etiqueta }}</span>
            </span>
            <span class="font-mono font-semibold shrink-0" :class="paso.delta > 0 ? 'text-success' : 'text-warning'">
              {{ paso.delta > 0 ? '+' : '−' }}{{ Math.abs(paso.delta) }}
            </span>
          </div>
          <p class="text-xs text-muted mt-1">
            {{ horaDe(paso) }}
            <span v-if="paso.usuarioId"> · {{ nombreDe(paso.usuarioId) }}</span>
            <span v-if="motivoLegible(paso)"> · {{ motivoLegible(paso) }}</span>
          </p>
        </li>
      </ol>

      <p v-else class="text-sm text-muted text-center py-1">
        No se movió stock del quiosco este día.
      </p>

      <div class="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
        <span class="text-sm font-semibold">Disponible para vender</span>
        <span class="font-mono text-lg font-bold text-primary">{{ datos.capacidad }}</span>
      </div>

      <!-- El resto del quiosco después de este cuadre: lo que había para
           vender menos lo que dice el cuadre que se vendió. -->
      <div class="flex items-center justify-between rounded-md bg-elevated/50 px-3 py-2">
        <span class="text-sm text-muted">Vendido en este cuadre</span>
        <span class="font-mono text-lg font-semibold">{{ props.vendido }}</span>
      </div>

      <div
        class="flex items-center justify-between rounded-md px-3 py-2"
        :class="queda < 0 ? 'bg-error/10' : 'bg-success/10'"
      >
        <span class="text-sm font-semibold">Queda en el quiosco</span>
        <span class="font-mono text-lg font-bold" :class="queda < 0 ? 'text-error' : 'text-success'">
          {{ queda }}
        </span>
      </div>

      <p
        v-if="queda < 0"
        class="flex items-start gap-2 rounded-md border border-error bg-error/10 px-3 py-2 text-sm text-error"
      >
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 mt-0.5" />
        <span>
          Se vendió <strong>{{ -queda }}</strong> más de lo que había en el quiosco.
          <template v-if="cerrable">Corrige la cantidad antes de cerrar el cuadre.</template>
          <template v-else>Ese día quedó descuadrado en el quiosco.</template>
        </span>
      </p>
    </div>

    <p v-else class="text-sm text-muted">
      No hay datos de este producto para ese día.
    </p>
  </BaseDialog>
</template>

<script setup>
import { TABLES } from '../../../shared/tables'

const props = defineProps({
  // Entrada del mapa de capacidadPorProducto(): { inicial, capacidad, pasos }.
  datos: { type: Object, default: null },
  /** Solo el nombre: el diálogo muestra nombre y descripción si están. */
  producto: { type: Object, default: null },
  /**
   * Vendido de este producto en el cuadre, con TODAS sus líneas sumadas: lo que
   * resta la capacidad es lo que queda en el quiosco, y un producto puede
   * tener varias líneas el mismo día por el duplicado de precio.
   */
  vendido: { type: Number, default: 0 },
  /**
   * Contexto de la vista que abre el diálogo. Desde /historial-quiosco el
   * desglose es de un día ya cerrado: los rótulos cambian ("Había al empezar el
   * día" sigue valiendo, pero "Corrige la cantidad antes de cerrar el cuadre"
   * sería una instrucción imposible de seguir).
   */
  dia: { type: String, default: null },
  historico: { type: Boolean, default: false }
})
const isOpen = defineModel({ type: Boolean, default: false })

const titulo = computed(() => {
  const nombre = props.producto?.nombre
  if (!props.dia) return nombre ?? 'Capacidad del día'
  return `${nombre ?? 'Producto'} · ${fmtDate(props.dia)}`
})

const subtitulo = computed(() => (props.dia
  ? 'De dónde sale el número de ese día.'
  : 'De dónde sale el número bajo la cantidad.'))

// Desde el historial el día ya pasó: no hay nada que corregir en este momento.
const cerrable = computed(() => !props.historico)

// Lo que queda en el quiosco cuando este cuadre se cierre. Negativo = el jefe
// escribió más de lo que había, que es justo lo que el rojo de la fila señala.
const queda = computed(() => (props.datos?.capacidad ?? 0) - props.vendido)

// Sin toast: si la lista no carga se ve el id como respaldo, no es un error.
const repo = useRepo(TABLES.usuarios, { toast: false })
const usuarios = ref([])

onMounted(async () => {
  try {
    const { data } = await repo.readAll()
    if (Array.isArray(data)) usuarios.value = data
  } catch {
    usuarios.value = []
  }
})

function nombreDe(usuarioId) {
  return usuarios.value.find(u => u.id === usuarioId)?.nombre ?? '—'
}

function horaDe(paso) {
  if (!paso.creadoEn) return '—'
  try {
    return new Date(paso.creadoEn).toLocaleString('es-MX', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

/** El motivo técnico (venta_directa_quiosco) no dice nada; el del jefe sí. */
function motivoLegible(paso) {
  const m = paso.motivo
  if (!m) return paso.nota ?? ''
  if (m.startsWith('venta_directa') || m === 'reposicion_quiosco') return paso.nota ?? ''
  return paso.nota ? `${m} · ${paso.nota}` : m
}

const ICONOS = {
  traspaso: 'i-lucide-arrow-right-left',
  devolucion: 'i-lucide-undo-2',
  merma: 'i-lucide-wrench',
  venta: 'i-lucide-receipt'
}

function iconoDe(paso) {
  return ICONOS[paso.tipo] ?? 'i-lucide-package'
}
</script>
