<script setup>
import { cuadres as config } from '~/config/tables'

definePageMeta({
  middleware: ['jefe']
})

const tableRef = ref(null)

const columns = [
  { accessorKey: 'id', header: 'ID', visible: false },
  { accessorKey: 'fecha', header: 'Fecha' },
  { accessorKey: 'estado', header: 'Estado' },
  { accessorKey: 'totalEsperado', header: 'Esperado' },
  { accessorKey: 'totalRealCaja', header: 'Real' },
  { accessorKey: 'montoTransferencia', header: 'Transferencia' },
  { accessorKey: 'montoFiado', header: 'Fiado' },
  { accessorKey: 'montoCobradoFiado', header: 'Cobrado fiado' },
  { accessorKey: 'diferencia', header: 'Diferencia' },
  { accessorKey: 'pagoTrabajador', header: 'Pago trab.' },
  { accessorKey: 'cerradoEn', header: 'Cerrado en' },
  { accessorKey: 'action', header: 'Acciones' }
]

function abrirDetalle(row) {
  navigateTo(`/cuadres/${row.id}`)
}
</script>

<template>
  <BaseHeaderPage
    :title="config.label.plural"
    description="Historial de cuadres del puesto"
  >
    <BaseTable
      ref="tableRef"
      :config="config"
      :columns="columns"
      :show-edit="false"
      :show-delete="false"
      :pagination="true"
    >
      <template #fecha-cell="{ row }">
        <UButton variant="link" color="primary" @click="abrirDetalle(row.original)">
          {{ row.original.fecha }}
        </UButton>
      </template>

      <template #estado-cell="{ row }">
        <UBadge
          :label="row.original.estado"
          :color="row.original.estado === 'cerrado' ? 'success' : 'warning'"
        />
      </template>

      <template #totalEsperado-cell="{ row }">
        {{ fmtPrecio(row.original.totalEsperado) }}
      </template>

      <template #totalRealCaja-cell="{ row }">
        {{ row.original.totalRealCaja != null ? fmtPrecio(row.original.totalRealCaja) : '—' }}
      </template>

      <template #montoTransferencia-cell="{ row }">
        {{ fmtPrecio(row.original.montoTransferencia) }}
      </template>

      <template #montoFiado-cell="{ row }">
        {{ fmtPrecio(row.original.montoFiado) }}
      </template>

      <template #montoCobradoFiado-cell="{ row }">
        {{ fmtPrecio(row.original.montoCobradoFiado) }}
      </template>

      <template #diferencia-cell="{ row }">
        <span
          :class="row.original.diferencia != null
            ? (row.original.diferencia >= 0 ? 'text-success' : 'text-error')
            : ''"
        >
          {{ row.original.diferencia != null ? fmtPrecio(row.original.diferencia) : '—' }}
        </span>
      </template>

      <template #pagoTrabajador-cell="{ row }">
        {{ row.original.pagoTrabajador ? fmtPrecio(row.original.pagoTrabajador) : '—' }}
      </template>

      <template #cerradoEn-cell="{ row }">
        {{ row.original.cerradoEn ? new Date(Number(row.original.cerradoEn)).toLocaleString('es-ES') : '—' }}
      </template>

      <template #row-actions-extra="{ rowData }">
        <UButton
          icon="i-lucide-eye"
          size="sm"
          color="neutral"
          variant="ghost"
          @click="abrirDetalle(rowData)"
        />
      </template>
    </BaseTable>
  </BaseHeaderPage>
</template>
