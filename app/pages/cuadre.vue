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
const inv = useInventario()

const showSugerencia = ref(false)
const sugerencias = ref([])

async function alCerrar() {
  const { faltantes } = await cerrarCuadre()
  void faltantes
  // Sugerencia de reposición con saldos recién calculados (solo jefe).
  if (auth.esJefe.value && cuadre.value?.estado === 'cerrado') {
    try {
      const [prods, saldos] = await Promise.all([inv.cargarProductos(), inv.cargarSaldos()])
      sugerencias.value = inv.sugerenciaParaManana(prods ?? [], saldos ?? [])
      if (sugerencias.value.length > 0) showSugerencia.value = true
    } catch {
      // Sin sugerencia no pasa nada: el cuadre ya quedó cerrado.
    }
  }
}

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
        @click="alCerrar"
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
              <span class="font-semibold">Total esperado (descontado)</span>
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
        <CuadreTransferenciaCard
          v-if="!esTrabajador"
          :cuadre-id="cuadre?.id ?? ''"
          :productos-activos="productosActivos"
          :puesto-id="auth.usuarioActual.value?.puestoId ?? ''"
          :readonly="cuadre?.estado !== 'abierto'"
          @actualizado="cargarDatos(auth.usuarioActual.value?.puestoId || '', cuadreIdParam?.value ?? null)"
        />
        <CuadreAjustesCard
          v-if="!esTrabajador"
          :cuadre-id="cuadre?.id ?? ''"
          :puesto-id="auth.usuarioActual.value?.puestoId ?? ''"
          :readonly="cuadre?.estado !== 'abierto'"
          @actualizado="cargarDatos(auth.usuarioActual.value?.puestoId || '', cuadreIdParam?.value ?? null)"
        />
        <CuadreCierreForm v-if="cuadre?.estado === 'abierto' && !esTrabajador" />
        <CuadreResumenCerrado v-if="cuadre?.estado === 'cerrado'" :cuadre="cuadre" />
      </div>
    </div>

    <InventarioDialogoSugerencia v-model="showSugerencia" :sugerencias="sugerencias" />
  </BaseHeaderPage>
</template>
