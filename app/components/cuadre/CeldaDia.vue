<template>
  <!-- Toda la celda es el botón: en móvil es lo único que hay que tocar y así
       no se pierde el área pulsable por el ancho del número. -->
  <button
    type="button"
    class="group relative mx-auto flex size-full min-h-8 w-full items-center justify-center font-mono text-sm tabular-nums transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
    :class="claseNumero"
    :title="titulo"
    :disabled="!celda"
    @click.stop="emit('abrir')"
  >
    <span v-if="celda">{{ celda.capacidad }}</span>
    <span v-else class="text-muted/40">·</span>

    <!-- Marca de día con movimientos. Un puntito y no un color de fondo: con 31
         columnas y varias filas, el fondo compite con el número. -->
    <span
      v-if="celda?.tieneMovimiento"
      class="absolute top-0.5 right-1 size-1 rounded-full"
      :class="deltaDelDia > 0 ? 'bg-success' : 'bg-warning'"
    />
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** { inicial, capacidad, pasos, vendido, tieneMovimiento, excedido, hayCuadre } */
  celda: { type: Object, default: null }
})

const emit = defineEmits(['abrir'])

/** Si el día entró (+) o salió (−) mercadería: define el color del puntito. */
const deltaDelDia = computed(() =>
  (props.celda?.pasos ?? []).reduce((s, p) => s + (Number(p.delta) || 0), 0))

const claseNumero = computed(() => {
  if (!props.celda) return 'text-muted/40'
  // Se vendió más de lo que había: el mismo rojo de la línea del cuadre.
  if (props.celda.excedido) return 'text-error font-semibold'
  if (props.celda.capacidad === 0) return 'text-muted/60'
  return 'text-default group-hover:text-primary'
})

const titulo = computed(() => {
  const c = props.celda
  if (!c) return 'Sin datos de este producto para el día'
  const partes = [`Había ${c.inicial}`]
  for (const p of c.pasos) partes.push(`${p.etiqueta} ${p.delta > 0 ? '+' : '−'}${Math.abs(p.delta)}`)
  partes.push(`Disponible ${c.capacidad}`)
  if (c.vendido > 0) partes.push(`Vendido ${c.vendido}`)
  return partes.join(' · ')
})
</script>
