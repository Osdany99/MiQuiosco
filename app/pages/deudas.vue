<template>
  <BaseHeaderPage
    title="Deudas"
    description="Cuentas por cobrar y cobros"
    leading-icon="i-lucide-hand-coins"
    :show-button="false"
  >
    <UTabs v-model="tab" :items="tabs" class="mb-4" />

    <UCard v-if="tab === 'deudas'" class="mb-4">
      <p class="text-xs text-muted">
        Pendiente por cobrar
      </p>
      <p class="text-xl font-bold font-mono">
        {{ fmtPrecio(totales.pendiente) }}
      </p>
      <p class="text-xs text-muted">
        {{ totales.deudores }} {{ totales.deudores === 1 ? 'deudor' : 'deudores' }}
      </p>
      <p class="text-xs text-muted">
        Quiosco {{ fmtPrecio(totales.pendienteQuiosco) }} · Recargas {{ fmtPrecio(totales.pendienteRecarga) }}
      </p>
    </UCard>

    <div class="flex justify-end mb-4">
      <USelectMenu
        v-model="filtroOrigen"
        :items="opcionesOrigen"
        value-key="value"
        label-key="label"
        :search-input="false"
        class="w-40"
      />
    </div>

    <div v-if="cargando" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-circle" class="animate-spin size-8 text-muted-foreground" />
    </div>

    <template v-else-if="tab === 'deudas'">
      <UAlert
        v-if="deudasFiltradas.length === 0"
        color="success"
        variant="soft"
        icon="i-lucide-circle-check"
        title="No hay deudas pendientes"
        description="Todo está saldado por ahora."
        class="mb-4"
      />

      <BaseTable
        v-else
        :data="deudasFiltradas"
        :columns="columnasDeuda"
        :ui="uiTabla"
        :pagination="false"
        :show-edit="false"
        :show-delete="false"
        :disable-filters="true"
        :show-reset="false"
      >
        <template #nombreCliente-cell="{ row }">
          <div class="min-w-0">
            <p class="truncate font-medium">
              {{ row.original.nombreCliente ?? 'Cliente' }}
            </p>
            <p
              v-if="row.original.origen === 'recarga'"
              class="truncate text-xs text-muted font-mono"
            >
              {{ row.original.etiquetaTelefono
                ? `${row.original.etiquetaTelefono} · ${row.original.telefonoDestino}`
                : row.original.telefonoDestino }} · {{ row.original.plataforma === 'banco' ? 'Banco' : 'Monedero' }} · {{ etiquetaTipoRecarga(row.original.tipo) }}
            </p>
            <UBadge
              v-if="row.original.directa"
              color="neutral"
              variant="outline"
              size="sm"
              label="directa"
            />
          </div>
        </template>
        <template #producto-cell="{ row }">
          <DeudasCeldaProducto :items="row.original.items" />
        </template>
        <template #origen-cell="{ row }">
          <UBadge
            :color="row.original.origen === 'recarga' ? 'info' : 'primary'"
            variant="soft"
            size="sm"
            :label="row.original.origen === 'recarga' ? 'Recarga' : 'Quiosco'"
          />
        </template>
        <template #estado-cell="{ row }">
          <UBadge :color="colorEstadoDeuda(row.original.estado)" variant="soft" size="sm">
            {{ row.original.estado }}
          </UBadge>
        </template>
        <template #montoTotal-cell="{ row }">
          <span class="font-mono">{{ fmtPrecio(row.original.montoTotal) }}</span>
        </template>
        <template #montoPagado-cell="{ row }">
          <span class="font-mono">{{ fmtPrecio(row.original.montoPagado) }}</span>
        </template>
        <template #saldoPendiente-cell="{ row }">
          <span class="font-mono font-medium">{{ fmtPrecio(row.original.saldoPendiente) }}</span>
        </template>
        <template #creadoEn-cell="{ row }">
          {{ formatearFecha(row.original.creadoEn) }}
        </template>
        <template #ganancia-cell="{ row }">
          <span v-if="row.original.ganancia != null" class="font-mono">{{ fmtPrecio(row.original.ganancia) }}</span>
          <span v-else class="text-muted">—</span>
        </template>
        <template #acciones-cell="{ row }">
          <div class="flex gap-1 justify-end">
            <UTooltip text="Cobrar" :delay-duration="0">
              <UButton
                icon="i-lucide-hand-coins"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Cobrar"
                @click="abrirCobro(row.original)"
              />
            </UTooltip>
            <UTooltip text="Ver pagos" :delay-duration="0">
              <UButton
                icon="i-lucide-history"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Ver pagos"
                @click="abrirHistorial(row.original)"
              />
            </UTooltip>
          </div>
        </template>
      </BaseTable>
    </template>

    <BaseTable
      v-else
      :data="pagadasFiltradas"
      :columns="columnasDeuda"
      :ui="uiTabla"
      :pagination="false"
      :show-edit="false"
      :show-delete="false"
      :disable-filters="true"
      :show-reset="false"
      empty-state="Sin deudas saldadas"
    >
      <template #nombreCliente-cell="{ row }">
        {{ row.original.nombreCliente ?? 'Cliente' }}
      </template>
      <template #producto-cell="{ row }">
        <DeudasCeldaProducto :items="row.original.items" />
      </template>
      <template #origen-cell="{ row }">
        <UBadge
          :color="row.original.origen === 'recarga' ? 'info' : 'primary'"
          variant="soft"
          size="sm"
          :label="row.original.origen === 'recarga' ? 'Recarga' : 'Quiosco'"
        />
      </template>
      <template #estado-cell>
        <UBadge
          color="success"
          variant="soft"
          size="sm"
          label="pagada"
        />
      </template>
      <template #montoTotal-cell="{ row }">
        <span class="font-mono">{{ fmtPrecio(row.original.montoTotal) }}</span>
      </template>
      <template #montoPagado-cell="{ row }">
        <span class="font-mono">{{ fmtPrecio(row.original.montoPagado) }}</span>
      </template>
      <template #saldoPendiente-cell>
        <span class="text-muted">—</span>
      </template>
      <template #creadoEn-cell="{ row }">
        {{ formatearFecha(row.original.creadoEn) }}
      </template>
      <template #ganancia-cell="{ row }">
        <span v-if="row.original.ganancia != null" class="font-mono">{{ fmtPrecio(row.original.ganancia) }}</span>
        <span v-else class="text-muted">—</span>
      </template>
      <template #acciones-cell>
        <div />
      </template>
    </BaseTable>

    <BaseDialog
      v-model="showCobro"
      title="Cobrar deuda"
      confirm-text="Registrar cobro"
      :loading="cobrando"
      :disabled-guardar="!puedeCobrar"
      @confirm="confirmarCobro"
      @cancel="showCobro = false"
    >
      <DeudasDialogoCobrar
        v-model="cobrarForm"
        :deuda="deudaACobrar"
      />
    </BaseDialog>

    <BaseDialog
      v-model="showCobroRecarga"
      title="Cobrar recarga"
      confirm-text="Registrar cobro"
      :loading="cobrandoRecarga"
      :disabled-guardar="!puedeCobrarRecarga"
      @confirm="confirmarCobroRecarga"
      @cancel="showCobroRecarga = false"
    >
      <RecargasDialogoCobrarRecarga v-model="cobroRecargaForm" :recarga="deudaACobrar" />
    </BaseDialog>

    <BaseDialog
      v-model="showHistorial"
      title="Pagos de la deuda"
      hide-confirm
      @cancel="showHistorial = false"
    >
      <p v-if="pagos.length === 0" class="text-sm text-muted">
        Esta deuda todavía no tiene pagos.
      </p>
      <ul v-else class="space-y-2">
        <li
          v-for="p in pagos"
          :key="p.id"
          class="flex items-center justify-between rounded-md border border-gray-200 p-2 text-sm dark:border-gray-800"
        >
          <div>
            <p class="font-mono font-medium">
              {{ fmtPrecio(p.monto) }}
            </p>
            <p class="text-xs text-muted">
              {{ formatearFecha(p.creadoEn) }} · {{ p.formaPago }} ·
              {{ p.cuadreId ? 'entró a caja' : 'cobro directo' }}
            </p>
          </div>
          <UBadge
            :color="p.cuadreId ? 'success' : 'warning'"
            variant="soft"
            size="sm"
            :label="p.cuadreId ? 'caja' : 'directo'"
          />
        </li>
      </ul>
    </BaseDialog>
  </BaseHeaderPage>
</template>

<script setup>
definePageMeta({
  middleware: ['jefe']
})

const toast = useToast()
const auth = useAuth()

const {
  cargarDeudas,
  cargarClientes,
  cobrarDeuda,
  pagosDeCuenta
} = useCuentasFiado()
const rec = useRecargas()

const tab = ref('deudas')
const tabs = [
  { label: 'Deudas', value: 'deudas' },
  { label: 'Saldadas', value: 'pagadas' }
]

const cargando = ref(true)
const deudas = ref([])
const pagadas = ref([])
const clientes = ref([])
const pagos = ref([])

const showCobro = ref(false)
const showCobroRecarga = ref(false)
const showHistorial = ref(false)
const cobrando = ref(false)
const cobrandoRecarga = ref(false)
const deudaACobrar = ref(null)

const cobrarForm = ref({ monto: 0, formaPago: 'efectivo' })
const cobroRecargaForm = ref({ monto: 0, formaPago: 'efectivo' })

const uiTabla = { td: 'px-3 py-2' }

const columnasDeuda = [
  { accessorKey: 'nombreCliente', header: 'Cliente' },
  { id: 'producto', header: 'Producto' },
  { accessorKey: 'origen', header: 'Origen' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'montoTotal', header: 'Total' },
  { accessorKey: 'montoPagado', header: 'Pagado' },
  { accessorKey: 'saldoPendiente', header: 'Saldo' },
  { accessorKey: 'creadoEn', header: 'Fecha' },
  // Oculta por defecto: el dato sigue en el selector de columnas.
  { accessorKey: 'ganancia', header: 'Ganancia', visible: false },
  { accessorKey: 'acciones', header: '' }
]

// El cobro es siempre directo: el jefe cobra en físico y ningún cuadre
// registra el dinero.
const puedeCobrar = computed(() => {
  if (!deudaACobrar.value) return false
  return true
})

// El diálogo de recargas valida contra su propio saldo (nominal − cobrado).
const puedeCobrarRecarga = computed(() => {
  if (!deudaACobrar.value || deudaACobrar.value.origen !== 'recarga') return false
  const saldo = Number(deudaACobrar.value.montoTotal ?? 0) - Number(deudaACobrar.value.montoPagado ?? 0)
  const monto = Number(cobroRecargaForm.value.monto)
  return monto > 0 && monto <= saldo
})

const totales = computed(() => {
  const pendiente = deudas.value.reduce((s, d) => s + (Number(d.saldoPendiente) || 0), 0)
  const deudores = new Set(deudas.value.map(d => d.clienteId)).size
  const pendienteQuiosco = deudas.value
    .filter(d => d.origen !== 'recarga')
    .reduce((s, d) => s + (Number(d.saldoPendiente) || 0), 0)
  const pendienteRecarga = deudas.value
    .filter(d => d.origen === 'recarga')
    .reduce((s, d) => s + (Number(d.saldoPendiente) || 0), 0)
  return { pendiente, deudores, pendienteQuiosco, pendienteRecarga }
})

// Filtro por origen de la deuda: la tabla es única, el badge distingue.
const filtroOrigen = ref('todas')
const opcionesOrigen = [
  { label: 'Todas', value: 'todas' },
  { label: 'Quiosco', value: 'quiosco' },
  { label: 'Recargas', value: 'recarga' }
]
const deudasFiltradas = computed(() => filtroOrigen.value === 'todas'
  ? deudas.value
  : deudas.value.filter(d => d.origen === filtroOrigen.value))
const pagadasFiltradas = computed(() => filtroOrigen.value === 'todas'
  ? pagadas.value
  : pagadas.value.filter(d => d.origen === filtroOrigen.value))

function etiquetaTipoRecarga(t) {
  if (t === 'saldo') return 'Saldo'
  if (t === 'voz') return 'Voz'
  if (t === 'datos') return 'Datos'
  if (t === 'sms') return 'SMS'
  return t || '—'
}

/**
 * Normaliza una recarga fiada a forma de deuda para la tabla única.
 * Conserva los campos propios (teléfono, plataforma, tipo, nominal) y el
 * nombre se resuelve contra los clientes cargados (el repo local no trae join).
 */
function aDeudaRecarga(r, nombrePorCliente) {
  const nominal = Number(r.montoNominal) || 0
  const cobrado = Number(r.montoCobrado) || 0
  return {
    ...r,
    origen: 'recarga',
    nombreCliente: r.nombreCliente ?? nombrePorCliente.get(r.clienteId) ?? 'Cliente',
    // Nombre propio del número: "Cheila 2" aunque el cliente sea "Cheila".
    etiquetaTelefono: r.telefonoDestino
      ? (rec.cli.telefonoDe(r.telefonoDestino)?.etiqueta ?? null)
      : null,
    estado: r.estadoPago === 'pagada' ? 'pagada' : (cobrado > 0 ? 'parcial' : 'pendiente'),
    montoTotal: nominal,
    montoPagado: cobrado,
    saldoPendiente: Math.max(0, nominal - cobrado),
    directa: false
  }
}

function formatearFecha(v) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleDateString('es-MX')
  } catch {
    return String(v)
  }
}

async function recargar() {
  cargando.value = true
  try {
    const puestoId = auth.usuarioActual.value?.puestoId
    const [cuentasQuiosco, listaClientes, filasRecargas] = await Promise.all([
      // Una sola lectura: pendientes y saldadas salen de la misma lista (los
      // ítems de cada deuda se leen una vez, no dos).
      cargarDeudas({ conSaldo: false }),
      // Incluye desactivados: una deuda vieja no debe perder el nombre.
      cargarClientes(puestoId, { incluirInactivos: true }),
      rec.cargarRecargas(),
      // Los alias de los números se leen de la caché de useClientes.
      rec.cli.cargarTelefonos()
    ])

    // El repo local no trae join: el nombre se resuelve aquí para los dos
    // orígenes (cuentas_fiado solo guarda clienteId).
    const nombrePorCliente = new Map((listaClientes ?? []).map(c => [c.id, c.nombre]))
    const aDeudaQuiosco = c => ({
      ...c,
      origen: 'quiosco',
      nombreCliente: c.nombreCliente ?? nombrePorCliente.get(c.clienteId) ?? 'Cliente'
    })
    const delPuesto = filasRecargas.filter(r => !puestoId || r.puestoId === puestoId)
    const recPend = delPuesto.filter(r => r.estadoPago !== 'pagada').map(r => aDeudaRecarga(r, nombrePorCliente))
    const recSald = delPuesto.filter(r => r.estadoPago === 'pagada').map(r => aDeudaRecarga(r, nombrePorCliente))
    const porFecha = (a, b) => new Date(b.creadoEn ?? 0) - new Date(a.creadoEn ?? 0)

    const quioscoPend = cuentasQuiosco.filter(c => c.estado !== 'pagada').map(aDeudaQuiosco)
    const quioscoSald = cuentasQuiosco.filter(c => c.estado === 'pagada').map(aDeudaQuiosco)
    deudas.value = [...quioscoPend, ...recPend].sort(porFecha)
    pagadas.value = [...quioscoSald, ...recSald].sort(porFecha)
    clientes.value = listaClientes
  } catch (err) {
    toast.add({ title: 'Error', description: err?.message, color: 'error' })
  } finally {
    cargando.value = false
  }
}

function abrirCobro(deuda) {
  deudaACobrar.value = deuda
  if (deuda.origen === 'recarga') {
    // Mismo diálogo del historial de recargas: monto + forma de pago.
    cobroRecargaForm.value = { monto: deuda.saldoPendiente, formaPago: 'efectivo' }
    showCobroRecarga.value = true
    return
  }
  cobrarForm.value = {
    monto: deuda.saldoPendiente,
    formaPago: 'efectivo'
  }
  showCobro.value = true
}

async function confirmarCobro() {
  const monto = Number(cobrarForm.value.monto) || 0
  if (monto <= 0) {
    toast.add({ title: 'Error', description: 'El monto debe ser mayor a cero.', color: 'error' })
    return
  }
  cobrando.value = true
  const r = await cobrarDeuda({
    cuentaFiadoId: deudaACobrar.value.id,
    cuadreId: null,
    monto,
    formaPago: cobrarForm.value.formaPago
  })
  cobrando.value = false
  if (r?.ok) {
    showCobro.value = false
    toast.add({
      title: 'Cobro directo registrado',
      color: 'success'
    })
    await recargar()
  }
}

async function abrirHistorial(deuda) {
  pagos.value = deuda.origen === 'recarga'
    ? (await rec.cobrosDeRecarga(deuda.id)).map(p => ({ ...p, cuadreId: null }))
    : await pagosDeCuenta(deuda.id)
  showHistorial.value = true
}

async function confirmarCobroRecarga() {
  const monto = Number(cobroRecargaForm.value.monto) || 0
  if (monto <= 0) {
    toast.add({ title: 'Error', description: 'El monto debe ser mayor a cero.', color: 'error' })
    return
  }
  cobrandoRecarga.value = true
  try {
    await rec.cobrar(deudaACobrar.value.id, monto, cobroRecargaForm.value.formaPago || 'efectivo')
    showCobroRecarga.value = false
    toast.add({ title: 'Cobro registrado', color: 'success' })
    await recargar()
  } catch (e) {
    toast.add({ title: 'No se pudo cobrar', description: e?.message, color: 'error' })
  } finally {
    cobrandoRecarga.value = false
  }
}

onMounted(recargar)
</script>
