<script setup>
/**
 * /recargas — Historial de recargas.
 *
 * Tabla con filtros (cliente, pagada/fiada, teléfono, origen y rango de
 * fechas). Las dos únicas cosas editables son a quién se le imputa la recarga
 * y su estado de pago: los montos vienen del SMS y no se tocan.
 */
import { recargas as config } from '../../../shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const auth = useAuth()
const rec = useRecargas()

const tableRef = ref(null)
const pid = computed(() => auth.usuarioActual.value?.puestoId ?? null)

const query = { orderBy: 'creadoEn', orderDir: 'desc' }

/**
 * La tabla arranca solo con lo pendiente: en el mostrador lo que importa es lo
 * que falta por cobrar. Se quita desde el propio filtro, sin tocar nada.
 */
const FILTRO_INICIAL = { estadoPago: 'pendiente' }

/**
 * Opciones del filtro de fecha. El valor es directamente el `desde` que
 * entienden el endpoint y el SQLite local, así que no hay nada que traducir.
 * Sin valor = todas las fechas, que es el estado por defecto.
 */
function inicioDia(diasAtras = 0) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (diasAtras > 0) d.setDate(d.getDate() - diasAtras)
  return d.toISOString()
}

const OPCIONES_FECHA = [
  { label: 'Hoy', value: inicioDia() },
  { label: '7 días', value: inicioDia(6) },
  { label: '30 días', value: inicioDia(29) }
]

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'creadoEn', header: 'Fecha', cell: 'date' },
  { accessorKey: 'nombreCliente', header: 'Cliente' },
  { accessorKey: 'telefonoDestino', header: 'Teléfono' },
  { accessorKey: 'plataforma', header: 'Origen' },
  { accessorKey: 'tipo', header: 'Tipo' },
  { accessorKey: 'montoNominal', header: 'Nominal', cell: 'currency' },
  { accessorKey: 'costo', header: 'Costo', cell: 'currency', visible: false },
  { accessorKey: 'ganancia', header: 'Ganancia', cell: 'currency' },
  { accessorKey: 'montoCobrado', header: 'Cobrado', cell: 'currency', visible: false },
  { accessorKey: 'estadoPago', header: 'Estado' },
  { accessorKey: 'acciones', header: '' }
]

// Filtros explícitos (no los deduce de las columnas) porque `nombreCliente` no
// es una columna: filtrar por ella dejaría la tabla vacía.
const filterFields = computed(() => [
  {
    key: 'desde',
    label: 'Fecha',
    type: 'select',
    options: OPCIONES_FECHA
  },
  {
    key: 'clienteId',
    label: 'Cliente',
    type: 'select',
    options: rec.cli.clientes.value.map(c => ({ label: c.nombre, value: c.id }))
  },
  {
    key: 'estadoPago',
    label: 'Estado',
    type: 'select',
    options: [
      { label: 'Pagada', value: 'pagada' },
      { label: 'Fiada', value: 'pendiente' }
    ]
  },
  { key: 'telefonoDestino', label: 'Teléfono', type: 'text' },
  {
    key: 'plataforma',
    label: 'Origen',
    type: 'select',
    options: [{ label: 'Banco', value: 'banco' }]
  }
])

const dialogoCobrar = ref(false)
const dialogoAsignar = ref(false)
const recargando = ref(null)
const cobroForm = ref({ monto: 0, formaPago: 'efectivo' })
const asignando = ref(null)
const guardando = ref(false)

const saldoDe = r => Math.max(0, Number(r.montoNominal ?? 0) - Number(r.montoCobrado ?? 0))

function nombreCliente(r) {
  if (!r.clienteId) return 'Sin asignar'
  return rec.cli.clientes.value.find(c => c.id === r.clienteId)?.nombre ?? 'Sin asignar'
}

function abrirCobrar(r) {
  recargando.value = r
  cobroForm.value = { monto: saldoDe(r), formaPago: 'efectivo' }
  dialogoCobrar.value = true
}

async function confirmarCobro() {
  guardando.value = true
  try {
    await rec.cobrar(recargando.value.id, cobroForm.value.monto, cobroForm.value.formaPago)
    dialogoCobrar.value = false
    recargando.value = null
    toast.add({ title: 'Cobro registrado', color: 'success' })
    await tableRef.value?.refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo cobrar', description: e?.message, color: 'error' })
  } finally {
    guardando.value = false
  }
}

function abrirAsignar(r) {
  asignando.value = r
  dialogoAsignar.value = true
}

async function onAsignar(clienteId) {
  try {
    await rec.asignarCliente(asignando.value.id, clienteId)
    await rec.cli.asignarTelefonoA(asignando.value.telefonoDestino, clienteId, pid.value)
    dialogoAsignar.value = false
    asignando.value = null
    toast.add({ title: 'Cliente asignado', color: 'success' })
    await tableRef.value?.refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo asignar', description: e?.message, color: 'error' })
  }
}

async function onCrearCliente({ nombre }) {
  try {
    const { cliente } = await rec.cli.crearClienteConTelefono(
      { nombre, telefono: asignando.value.telefonoDestino },
      pid.value
    )
    await rec.asignarCliente(asignando.value.id, cliente.id)
    dialogoAsignar.value = false
    asignando.value = null
    toast.add({ title: `Cliente "${cliente.nombre}" creado`, color: 'success' })
    await tableRef.value?.refresh()
  } catch (e) {
    toast.add({ title: 'No se pudo crear', description: e?.message, color: 'error' })
  }
}

async function cargarClientes() {
  if (!pid.value) return
  await rec.cli.cargarClientes(pid.value)
  await rec.cli.cargarTelefonos()
  await rec.cargarRecargas()
}

// En cuanto se conoce el puesto, no en el mount: al arrancar en frío la sesión
// puede llegar después y `puestoId` ser null, con lo que la columna Cliente se
// pintaría entera como "Sin asignar".
watch(pid, cargarClientes, { immediate: true })

const soltarResume = null
onUnmounted(() => soltarResume?.())
</script>

<template>
  <BaseHeaderPage
    title="Recargas"
    description="Historial de recargas registradas"
    leading-icon="i-lucide-smartphone-charging"
  >
    <template #trailing>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Recargar"
        :loading="rec.cargando.value"
        @click="tableRef?.refresh(); cargarClientes()"
      />
    </template>

    <p class="mb-2 text-xs text-muted">
      Totales de todo el historial, sin aplicar los filtros de la tabla.
    </p>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <UCard>
        <p class="text-xs text-muted">
          Recargas
        </p>
        <p class="text-xl font-bold font-mono">
          {{ rec.totales.value.cantidad }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Fiadas
        </p>
        <p class="text-xl font-bold font-mono text-warning">
          {{ rec.totales.value.pendientes }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Saldo por cobrar
        </p>
        <p class="text-xl font-bold font-mono">
          {{ rec.totales.value.saldo }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Ganancia
        </p>
        <p class="text-xl font-bold font-mono text-success">
          +{{ rec.totales.value.ganancia }}
        </p>
      </UCard>
    </div>

    <BaseTable
      ref="tableRef"
      :config="config"
      :columns="columns"
      :filter-fields="filterFields"
      :initial-filters="FILTRO_INICIAL"
      :query="query"
      :search="''"
      empty-state="No hay recargas con esos filtros"
      :show-edit="false"
      :show-delete="false"
    >
      <template #nombreCliente-cell="{ row }">
        <UBadge
          variant="soft"
          size="sm"
          :color="row.original.clienteId ? 'success' : 'warning'"
          :label="nombreCliente(row.original)"
        />
      </template>

      <template #telefonoDestino-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.telefonoDestino }}</span>
      </template>

      <template #plataforma-cell="{ row }">
        <UBadge
          variant="outline"
          size="sm"
          color="neutral"
          :label="row.original.plataforma === 'banco' ? 'Banco' : 'Monedero'"
        />
      </template>

      <template #tipo-cell="{ row }">
        <span class="text-xs text-muted">
          {{ row.original.tipo === 'saldo'
            ? 'Saldo'
            : `${row.original.tipo} ${row.original.unidades ?? ''}`.trim() }}
        </span>
      </template>

      <template #montoCobrado-cell="{ row }">
        <span class="font-mono">
          {{ Number(row.original.montoCobrado ?? 0) }}
          <span
            v-if="saldoDe(row.original) > 0"
            class="text-warning"
          >· faltan {{ saldoDe(row.original) }}</span>
        </span>
      </template>

      <template #estadoPago-cell="{ row }">
        <UBadge
          variant="soft"
          size="sm"
          :color="row.original.estadoPago === 'pagada' ? 'success' : 'warning'"
          :label="row.original.estadoPago === 'pagada' ? 'pagada' : 'fiada'"
        />
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex gap-1 justify-end">
          <UButton
            v-if="!row.original.clienteId"
            size="xs"
            color="neutral"
            variant="ghost"
            label="Asignar"
            @click="abrirAsignar(row.original)"
          />
          <UButton
            v-else-if="row.original.estadoPago !== 'pagada'"
            size="xs"
            icon="i-lucide-hand-coins"
            color="primary"
            variant="soft"
            label="Cobrar"
            @click="abrirCobrar(row.original)"
          />
        </div>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="dialogoCobrar"
      title="Cobrar recarga"
      confirm-text="Registrar cobro"
      :loading="guardando"
      :disabled-guardar="Number(cobroForm.monto) <= 0 || Number(cobroForm.monto) > (recargando ? saldoDe(recargando) : 0)"
      @confirm="confirmarCobro"
      @cancel="dialogoCobrar = false"
    >
      <RecargasDialogoCobrarRecarga v-model="cobroForm" :recarga="recargando" />
    </BaseDialog>

    <RecargasDialogoAsignarCliente
      v-model="dialogoAsignar"
      :telefono="asignando?.telefonoDestino ?? ''"
      :monto-nominal="Number(asignando?.montoNominal ?? 0)"
      :clientes="rec.cli.clientes.value"
      @asignar="onAsignar"
      @crear="onCrearCliente"
    />
  </BaseHeaderPage>
</template>
