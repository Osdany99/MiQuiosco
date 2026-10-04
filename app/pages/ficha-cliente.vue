<script setup>
/**
 * /ficha-cliente — Buscador de clientes con su ficha de deuda.
 *
 * Arriba un buscador por nombre o número; del cliente seleccionado muestra
 * sus deudas pendientes (quiosco + recargas) y el día que le tocaría
 * recargar (última recarga + 30 días calendario).
 *
 * Es SOLO LECTURA: cobrar se hace desde /deudas o /recargas, igual que en
 * el diálogo de deudas de /clientes.
 */
import { normalizarTelefono } from '../utils/parseEtecsaSms'

definePageMeta({
  middleware: ['jefe']
})

const auth = useAuth()
const cli = useClientes()
const rec = useRecargas()
const fiado = useCuentasFiado()

const pid = computed(() => auth.usuarioActual.value?.puestoId ?? null)

const busqueda = ref('')
const seleccionado = ref(null)
const cargandoFicha = ref(false)
const recargasPend = ref([])
const recargasTodas = ref([])
const deudas = ref([])

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

/**
 * Los datos se cargan en cuanto se conoce el puesto, igual que en /clientes:
 * al arrancar la sesión puede aún no estar resuelta y `puestoId` llega null.
 */
watch(pid, async (valor) => {
  if (!valor) return
  await cli.cargarTelefonos()
  await cli.cargarClientes(valor)
}, { immediate: true })

function telefonosDe(clienteId) {
  return cli.telefonos.value.filter(t => t.clienteId === clienteId && t.activo !== false)
}

/**
 * Coincide por nombre o por número (parcial). El número se compara en forma
 * de dígitos para que "5..." encuentre el canónico de 10 dígitos.
 */
const resultados = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  if (!q) return []
  const digitos = normalizarTelefono(q) || q.replace(/\D/g, '')
  return cli.clientes.value
    .filter((c) => {
      if (String(c.nombre ?? '').toLowerCase().includes(q)) return true
      if (!digitos) return false
      return telefonosDe(c.id).some(t => String(t.telefono ?? '').includes(digitos))
    })
    .slice(0, 8)
})

async function seleccionar(cliente) {
  seleccionado.value = cliente
  busqueda.value = cliente.nombre ?? ''
  await cargarFicha()
}

function limpiar() {
  seleccionado.value = null
  busqueda.value = ''
  recargasPend.value = []
  recargasTodas.value = []
  deudas.value = []
}

async function cargarFicha() {
  if (!seleccionado.value?.id) return
  cargandoFicha.value = true
  try {
    const [r, d] = await Promise.all([
      rec.cargarRecargas({ clienteId: seleccionado.value.id }),
      fiado.cargarDeudas({ conSaldo: true, clienteId: seleccionado.value.id })
    ])
    recargasTodas.value = r || []
    recargasPend.value = (r || []).filter(x => x.estadoPago !== 'pagada')
    deudas.value = d || []
  } finally {
    cargandoFicha.value = false
  }
}

const saldoRecargas = computed(() => recargasPend.value.reduce(
  (s, r) => s + Math.max(0, Number(r.montoNominal ?? 0) - Number(r.montoCobrado ?? 0)),
  0
))
const saldoQuiosco = computed(() => deudas.value.reduce(
  (s, d) => s + Math.max(0, Number(d.saldoPendiente ?? 0)),
  0
))
const total = computed(() => Math.round((saldoRecargas.value + saldoQuiosco.value) * 100) / 100)

/** Última recarga del cliente (pagadas incluidas): base del +30 días. */
const ultimaRecarga = computed(() => {
  let mejor = null
  for (const r of recargasTodas.value) {
    if (!r.creadoEn) continue
    const f = new Date(r.creadoEn)
    if (Number.isNaN(f.getTime())) continue
    if (!mejor || f > mejor) mejor = f
  }
  return mejor
})

/** Día que le tocaría recargar: 30 días calendario tras la última. */
const proximaRecarga = computed(() => {
  if (!ultimaRecarga.value) return null
  const d = new Date(ultimaRecarga.value)
  d.setDate(d.getDate() + 30)
  return d
})

function inicioDelDia(f) {
  const d = new Date(f)
  d.setHours(0, 0, 0, 0)
  return d
}

const diasParaRecarga = computed(() => {
  if (!proximaRecarga.value) return null
  const hoy = inicioDelDia(new Date())
  return Math.round((inicioDelDia(proximaRecarga.value) - hoy) / 86400000)
})

const estadoRecarga = computed(() => {
  if (diasParaRecarga.value == null) return 'sin'
  if (diasParaRecarga.value < 0) return 'vencida'
  if (diasParaRecarga.value === 0) return 'hoy'
  return 'proxima'
})

const colorRecarga = computed(() => {
  if (estadoRecarga.value === 'vencida') return 'error'
  if (estadoRecarga.value === 'hoy') return 'warning'
  if (estadoRecarga.value === 'proxima') return 'success'
  return 'neutral'
})

function textoRecarga() {
  if (estadoRecarga.value === 'sin') return 'Sin recargas registradas'
  if (estadoRecarga.value === 'vencida') {
    const n = Math.abs(diasParaRecarga.value)
    return n === 1 ? 'Le tocaba ayer' : `Vencida hace ${n} días`
  }
  if (estadoRecarga.value === 'hoy') return 'Le toca hoy'
  return diasParaRecarga.value === 1 ? 'Le toca mañana' : `Le toca en ${diasParaRecarga.value} días`
}

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
  <BaseHeaderPage
    title="Ficha del cliente"
    description="Busca un cliente y ve sus deudas y su próxima recarga"
    leading-icon="i-lucide-user-search"
    :show-button="false"
  >
    <UAlert
      v-if="!pid"
      color="warning"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Sin puesto identificado"
      description="Inicia sesión con un jefe para buscar clientes."
      class="mb-4"
    />

    <UCard v-else class="mb-4">
      <div class="flex gap-2">
        <UInput
          v-model="busqueda"
          placeholder="Nombre o número del cliente…"
          icon="i-lucide-search"
          class="w-full"
          @keyup.enter="resultados.length && seleccionar(resultados[0])"
        />
        <UButton
          v-if="busqueda || seleccionado"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          aria-label="Limpiar"
          @click="limpiar"
        />
      </div>

      <ul v-if="busqueda.trim() && !seleccionado" class="mt-2 divide-y divide-default">
        <li v-if="!resultados.length" class="px-2 py-3 text-sm text-muted">
          Sin coincidencias
        </li>
        <li v-for="c in resultados" :key="c.id">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-start px-2 py-2"
            @click="seleccionar(c)"
          >
            <span class="min-w-0 text-left">
              <span class="block truncate font-medium">{{ c.nombre }}</span>
              <span class="block truncate font-mono text-xs text-muted">
                {{ telefonosDe(c.id).map(t => t.telefono).join(' · ') || 'sin números' }}
              </span>
            </span>
          </UButton>
        </li>
      </ul>
      <ul v-else-if="busqueda.trim() && seleccionado && resultados.length > 1" class="mt-2 divide-y divide-default">
        <li v-for="c in resultados.filter(x => x.id !== seleccionado.id)" :key="c.id">
          <UButton
            color="neutral"
            variant="ghost"
            class="w-full justify-start px-2 py-2"
            @click="seleccionar(c)"
          >
            <span class="min-w-0 text-left">
              <span class="block truncate font-medium">{{ c.nombre }}</span>
              <span class="block truncate font-mono text-xs text-muted">
                {{ telefonosDe(c.id).map(t => t.telefono).join(' · ') || 'sin números' }}
              </span>
            </span>
          </UButton>
        </li>
      </ul>
    </UCard>

    <div v-if="seleccionado && cargandoFicha" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <template v-else-if="seleccionado">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <UCard>
          <p class="text-xs text-muted">
            Cliente
          </p>
          <p class="truncate text-lg font-bold">
            {{ seleccionado.nombre }}
          </p>
          <div class="mt-1 flex flex-wrap gap-1">
            <UBadge
              v-for="t in telefonosDe(seleccionado.id)"
              :key="t.id"
              variant="soft"
              size="sm"
              color="primary"
              class="font-mono"
              :label="t.telefono"
            />
            <span v-if="!telefonosDe(seleccionado.id).length" class="text-xs text-muted">
              sin números
            </span>
          </div>
          <p v-if="seleccionado.notas" class="mt-1 truncate text-xs text-muted">
            {{ seleccionado.notas }}
          </p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">
            Próxima recarga
          </p>
          <p class="text-lg font-bold font-mono">
            {{ proximaRecarga ? fecha(proximaRecarga) : '—' }}
          </p>
          <div class="mt-1">
            <UBadge
              :color="colorRecarga"
              variant="soft"
              size="sm"
              :label="textoRecarga()"
            />
          </div>
          <p class="mt-1 text-xs text-muted">
            {{ ultimaRecarga ? `Última: ${fecha(ultimaRecarga)}` : 'Aún no tiene recargas' }}
          </p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">
            Total a cobrar
          </p>
          <p class="text-lg font-bold font-mono" :class="total > 0 ? 'text-warning' : 'text-success'">
            {{ fmtPrecio(total) }}
          </p>
          <p class="mt-1 text-xs text-muted">
            Recargas {{ fmtPrecio(saldoRecargas) }} · Quiosco {{ fmtPrecio(saldoQuiosco) }}
          </p>
        </UCard>
      </div>

      <UAlert
        v-if="total === 0"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        title="No debe nada"
        description="No tiene recargas fiadas ni deudas del quiosco pendientes."
        class="mb-4"
      />

      <div v-else class="space-y-5">
        <section v-if="recargasPend.length">
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
          <UTable :data="recargasPend" :columns="columnasRecarga" :ui="uiTabla">
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
  </BaseHeaderPage>
</template>
