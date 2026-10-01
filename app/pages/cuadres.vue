<script setup>
import { cuadres as config } from '../../shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const auth = useAuth()
const toast = useToast()
const cuadreCtl = useCuadre()

const tableRef = ref(null)
const reabrirOpen = ref(false)
const reabrirTarget = ref(null)
const reabriendo = ref(false)

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'fecha', header: 'Fecha', cell: 'date' },
  { accessorKey: 'estado', header: 'Estado', cell: 'boolean', labelTrue: 'abierto', labelFalse: 'cerrado', colorTrue: 'warning', colorFalse: 'success' },
  { accessorKey: 'totalEsperado', header: 'Esperado', cell: 'currency' },
  { accessorKey: 'totalRealCaja', header: 'Real', cell: 'currencyWithValue' },
  { accessorKey: 'montoTransferencia', header: 'Transferencia', cell: 'currency' },
  { accessorKey: 'montoFiado', header: 'Fiado', cell: 'currency' },
  { accessorKey: 'montoCobradoFiado', header: 'Cobrado fiado', cell: 'currency' },
  { accessorKey: 'diferencia', header: 'Diferencia' },
  { accessorKey: 'costoTotal', header: 'Costo' },
  { accessorKey: 'ganancia', header: 'Ganancia' },
  { accessorKey: 'pagoTrabajador', header: 'Pago trab.', cell: 'currencyWithValue' },
  { accessorKey: 'cerradoEn', header: 'Cerrado en', cell: 'dateWithValue' },
  { accessorKey: 'action', header: 'Acciones' }
]

function entrarACuadre(id) {
  return navigateTo(`/cuadre?id=${id}`)
}

function pedirReabrir(row) {
  reabrirTarget.value = row
  reabrirOpen.value = true
}

async function confirmarReabrir() {
  const row = reabrirTarget.value
  if (!row?.id) return
  const pid = auth.usuarioActual.value?.puestoId
  if (!pid) {
    toast.add({ title: 'Configuración incompleta', description: 'No tienes un puesto asignado. Contacta al administrador.', color: 'warning' })
    return
  }
  reabriendo.value = true
  try {
    await cuadreCtl.cargarDatos(pid, row.id)
    await cuadreCtl.reabrirCuadre()
    if (cuadreCtl.cuadre.value?.estado !== 'abierto') {
      toast.add({ title: 'No se pudo reabrir', description: 'El cuadre ya no está cerrado.', color: 'error' })
      return
    }
    reabrirOpen.value = false
    reabrirTarget.value = null
    await entrarACuadre(row.id)
  } finally {
    reabriendo.value = false
  }
}
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Historial de cuadres del puesto"
    :show-button="false"
  >
    <BaseTable
      ref="tableRef"
      :config="config"
      :columns="columns"
      :show-edit="false"
      :show-delete="false"
      :show-details="true"
      :details-condition="(row) => row.estado === 'cerrado'"
      :pagination="true"
      @details="(row) => entrarACuadre(row.id)"
    >
      <template #diferencia-cell="{ row }">
        <span
          :class="row.original.diferencia != null
            ? (row.original.diferencia >= 0 ? 'text-success' : 'text-error')
            : ''"
        >
          {{ row.original.diferencia != null ? fmtPrecio(row.original.diferencia) : '—' }}
        </span>
      </template>
      <template #costoTotal-cell="{ row }">
        {{ row.original.costoTotal != null ? fmtPrecio(row.original.costoTotal) : '—' }}
      </template>
      <template #ganancia-cell="{ row }">
        <span :class="row.original.ganancia != null ? 'text-success font-medium' : ''">
          {{ row.original.ganancia != null ? fmtPrecio(row.original.ganancia) : '—' }}
        </span>
      </template>
      <template #row-actions-extra="{ rowData }">
        <UTooltip v-if="rowData.estado === 'abierto'" text="Continuar" :delay-duration="0">
          <UButton
            icon="i-lucide-play"
            size="sm"
            color="success"
            variant="ghost"
            @click="entrarACuadre(rowData.id)"
          />
        </UTooltip>
        <UTooltip v-if="rowData.estado === 'cerrado'" text="Reabrir" :delay-duration="0">
          <UButton
            icon="i-lucide-rotate-ccw"
            size="sm"
            color="warning"
            variant="ghost"
            @click="pedirReabrir(rowData)"
          />
        </UTooltip>
      </template>
    </BaseTable>

    <BaseDialog
      v-model="reabrirOpen"
      title="Reabrir cuadre"
      confirm-text="Reabrir"
      :loading="reabriendo"
      @confirm="confirmarReabrir"
      @cancel="reabrirOpen = false"
    >
      <p class="text-gray-600 dark:text-gray-300">
        ¿Reabrir el cuadre del {{ reabrirTarget?.fecha ?? '' }}? Volverá a estado abierto y podrás editarlo.
      </p>
    </BaseDialog>
  </BaseHeaderPage>
</template>
