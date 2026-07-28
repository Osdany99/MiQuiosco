<script setup>
import { cuadres as config } from '~~/shared/tables'

definePageMeta({
  middleware: ['jefe']
})

const tableRef = ref(null)

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
  { accessorKey: 'pagoTrabajador', header: 'Pago trab.', cell: 'currencyWithValue' },
  { accessorKey: 'cerradoEn', header: 'Cerrado en', cell: 'dateWithValue' },
  { accessorKey: 'action', header: 'Acciones' }
]
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
      @details="(row) => navigateTo(`/cuadre?id=${row.id}`)"
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
    </BaseTable>
  </BaseHeaderPage>
</template>
