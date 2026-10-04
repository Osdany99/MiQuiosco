<script setup>
/**
 * Deudas de un cliente: recargas fiadas + deuda del quiosco, en un solo sitio.
 *
 * Es la lectura unificada que pedía el plan (Fase 4), sin tocar el camino de
 * escritura de Deudas. Es SOLO LECTURA: cobrar se hace desde /recargas o
 * /deudas, para no encadenar un modal dentro de otro en móvil.
 */
const abierta = defineModel({ type: Boolean, default: false })

const props = defineProps({
  cliente: { type: Object, default: null }
})

const rec = useRecargas()
const fiado = useCuentasFiado()

const columnasRecarga = [
  { accessorKey: 'fecha', header: 'Fecha' },
  { accessorKey: 'tipo', header: 'Tipo' },
  { accessorKey: 'telefonoDestino', header: 'Teléfono' },
  { accessorKey: 'montoNominal', header: 'Total' },
  { accessorKey: 'saldo', header: 'Debe' }
]

const columnasDeuda = [
  { accessorKey: 'fecha', header: 'Fecha' },
  { accessorKey: 'origen', header: 'Origen' },
  { accessorKey: 'montoTotal', header: 'Total' },
  { accessorKey: 'saldo', header: 'Debe' }
]

const uiTabla = { td: 'px-2 py-2' }

const cargando = ref(false)
const recargas = ref([])
const deudas = ref([])

watch(abierta, (v) => {
  if (v) cargar()
})

async function cargar() {
  if (!props.cliente?.id) return
  cargando.value = true
  try {
    // `cargarRecargas` reutiliza el repo activo (remoto o SQLite), así que el
    // mismo diálogo funciona igual online y offline.
    const [r, d] = await Promise.all([
      rec.cargarRecargas({ clienteId: props.cliente.id }),
      fiado.cargarDeudas({ conSaldo: true, clienteId: props.cliente.id })
    ])
    recargas.value = (r || []).filter(x => x.estadoPago !== 'pagada')
    deudas.value = d || []
  } finally {
    cargando.value = false
  }
}

const saldoRecargas = computed(() => recargas.value.reduce(
  (s, r) => s + Math.max(0, Number(r.montoNominal ?? 0) - Number(r.montoCobrado ?? 0)),
  0
))
const saldoQuiosco = computed(() => deudas.value.reduce(
  (s, d) => s + Math.max(0, Number(d.saldoPendiente ?? 0)),
  0
))
const total = computed(() => Math.round((saldoRecargas.value + saldoQuiosco.value) * 100) / 100)

function fecha(v) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleDateString('es-MX')
  } catch {
    return String(v)
  }
}

function tipoRecarga(r) {
  return r.tipo === 'saldo' ? 'Saldo' : `${r.tipo} ${r.unidades ?? ''}`.trim()
}

function saldoDeRecarga(r) {
  return Math.max(0, Number(r.montoNominal ?? 0) - Number(r.montoCobrado ?? 0))
}
</script>

<template>
  <BaseDialog
    v-model="abierta"
    :title="`Deudas de ${cliente?.nombre ?? ''}`"
    description="Lo que debe ahora mismo, por origen"
    hide-confirm
    @cancel="abierta = false"
  >
    <div v-if="cargando" class="flex justify-center py-10">
      <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin text-muted" />
    </div>

    <template v-else>
      <div class="mb-4 rounded-lg border border-default p-3">
        <p class="text-xs text-muted">
          Total a cobrar
        </p>
        <p class="text-2xl font-bold font-mono" :class="total > 0 ? 'text-warning' : 'text-success'">
          {{ fmtPrecio(total) }}
        </p>
        <p class="mt-1 text-xs text-muted">
          Recargas {{ fmtPrecio(saldoRecargas) }} · Quiosco {{ fmtPrecio(saldoQuiosco) }}
        </p>
      </div>

      <UAlert
        v-if="total === 0"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        title="No debe nada"
        description="No tiene recargas fiadas ni deudas del quiosco pendientes."
      />

      <div v-else class="space-y-5">
        <section v-if="recargas.length">
          <h3 class="mb-2 flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-smartphone-charging" class="size-4 text-primary" />
            Recargas
            <UBadge
              variant="soft"
              size="sm"
              color="warning"
              :label="fmtPrecio(saldoRecargas)"
            />
          </h3>
          <UTable :data="recargas" :columns="columnasRecarga" :ui="uiTabla">
            <template #fecha-cell="{ row }">
              {{ fecha(row.original.creadoEn) }}
            </template>
            <template #tipo-cell="{ row }">
              {{ tipoRecarga(row.original) }}
            </template>
            <template #telefonoDestino-cell="{ row }">
              <span class="font-mono text-xs">{{ row.original.telefonoDestino }}</span>
            </template>
            <template #montoNominal-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.montoNominal) }}</span>
            </template>
            <template #saldo-cell="{ row }">
              <span class="font-mono font-medium text-warning">
                {{ fmtPrecio(saldoDeRecarga(row.original)) }}
              </span>
            </template>
          </UTable>
        </section>

        <section v-if="deudas.length">
          <h3 class="mb-2 flex items-center gap-2 text-sm font-medium">
            <UIcon name="i-lucide-store" class="size-4 text-primary" />
            Quiosco
            <UBadge
              variant="soft"
              size="sm"
              color="warning"
              :label="fmtPrecio(saldoQuiosco)"
            />
          </h3>
          <UTable :data="deudas" :columns="columnasDeuda" :ui="uiTabla">
            <template #origen-cell="{ row }">
              <UBadge
                variant="outline"
                size="sm"
                color="neutral"
                :label="row.original.directa ? 'fuera del cuadre' : 'del cuadre'"
              />
            </template>
            <template #fecha-cell="{ row }">
              {{ fecha(row.original.creadoEn) }}
            </template>
            <template #montoTotal-cell="{ row }">
              <span class="font-mono">{{ fmtPrecio(row.original.montoTotal) }}</span>
            </template>
            <template #saldo-cell="{ row }">
              <span class="font-mono font-medium text-warning">{{ fmtPrecio(row.original.saldoPendiente) }}</span>
            </template>
          </UTable>
        </section>
      </div>

      <p class="mt-4 text-xs text-muted">
        Para cobrar, ve a Deudas (quiosco) o Recargas (recargas): aquí solo se informa.
      </p>
    </template>
  </BaseDialog>
</template>
