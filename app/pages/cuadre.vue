<script setup>
const auth = useAuth()
const route = useRoute()
const cuadreIdParam = computed(() => route.query.id || null)
const {
  cuadre, totalEsperado, productosActivos, hoy,
  cerrarCuadre, reabrirCuadre, cargarDatos,
  tituloCuadre, esTrabajador,
  totalRealCaja, montoTransferencia, montoFiado, faltanteReal
} = useCuadre()

onMounted(() => {
  const pid = auth.usuarioActual.value?.puestoId
  if (!pid) {
    console.warn('puestoId no disponible en usuarioActual:', auth.usuarioActual.value)
    return
  }
  cargarDatos(pid, cuadreIdParam.value)
})
</script>

<template>
  <BaseHeaderPage
    :title="tituloCuadre"
    :description="cuadre?.fecha ?? hoy"
    leading-icon="i-lucide-clipboard-check"
    :show-button="false"
  >
    <template #trailing>
      <UButton
        v-if="!esTrabajador && cuadre?.estado === 'cerrado'"
        variant="outline"
        color="warning"
        icon="i-lucide-rotate-ccw"
        label="Reabrir"
        @click="reabrirCuadre"
      />
      <UButton
        v-if="!esTrabajador && cuadre?.estado === 'abierto'"
        color="success"
        icon="i-lucide-lock"
        label="Cerrar cuadre"
        @click="cerrarCuadre"
      />
    </template>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 space-y-4">
        <CuadreLineaTable :readonly="cuadre?.estado !== 'abierto'" @reload="cargarDatos(auth.usuarioActual.value?.puestoId || '', cuadreIdParam?.value ?? null)" />
      </div>

      <div class="space-y-4">
        <UCard class="bg-primary/5 border-primary">
          <div class="space-y-2">
            <div class="flex justify-between items-center">
              <span class="font-semibold">Total esperado (ventas del día)</span>
              <span class="text-xl font-mono font-bold text-primary">{{ fmtPrecio(totalEsperado) }}</span>
            </div>
            <hr v-if="faltanteReal != null" class="border-t border-gray-200 dark:border-gray-800">
            <template v-if="faltanteReal != null">
              <div class="flex justify-between text-sm">
                <span>En caja (efectivo)</span>
                <span class="font-mono">{{ fmtPrecio(totalRealCaja ?? 0) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span>En transferencia</span>
                <span class="font-mono">{{ fmtPrecio(montoTransferencia) }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span>En deuda (fiado)</span>
                <span class="font-mono">{{ fmtPrecio(montoFiado) }}</span>
              </div>
              <hr class="border-t border-gray-200 dark:border-gray-800">
              <div class="flex justify-between items-center font-semibold" :class="faltanteReal > 0 ? 'text-error' : faltanteReal < 0 ? 'text-success' : ''">
                <span>{{ faltanteReal > 0 ? 'Faltante' : faltanteReal < 0 ? 'Sobrante' : 'Exacto' }}</span>
                <span class="font-mono">{{ fmtPrecio(Math.abs(faltanteReal)) }}</span>
              </div>
            </template>
            <div v-else class="text-sm text-gray-500 italic">
              Ingresa el dinero real en caja en el formulario de cierre para ver el desglose.
            </div>
          </div>
        </UCard>

        <CuadreFiadoCard
          v-if="!esTrabajador"
          :cuadre-id="cuadre?.id ?? ''"
          :productos-activos="productosActivos"
          :puesto-id="auth.usuarioActual.value?.puestoId ?? ''"
          :readonly="cuadre?.estado !== 'abierto'"
          @actualizado="cargarDatos(auth.usuarioActual.value?.puestoId || '', cuadreIdParam?.value ?? null)"
        />
        <CuadreCierreForm v-if="cuadre?.estado === 'abierto' && !esTrabajador" />
        <CuadreResumenCerrado v-if="cuadre?.estado === 'cerrado'" :cuadre="cuadre" />
      </div>
    </div>
  </BaseHeaderPage>
</template>
