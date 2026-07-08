<script setup>
definePageMeta({
  // Sin middleware de rol — auth.global.js ya verifica sesión.
  // El control de acceso por rol se maneja en el template (v-if esTrabajador).
})

const auth = useAuth()
const {
  cuadre, totalEsperado, productosActivos, hoy,
  cerrarCuadre, reabrirCuadre, cargarDatos,
  tituloCuadre, esTrabajador
} = useCuadre()

onMounted(() => {
  const pid = auth.usuarioActual.value?.puestoId
  if (!pid) {
    console.warn('puestoId no disponible en usuarioActual:', auth.usuarioActual.value)
    return
  }
  cargarDatos(pid)
})
</script>

<template>
  <BaseHeaderPage
    :title="tituloCuadre"
    :description="hoy"
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
        <CuadreLineaTable :readonly="cuadre?.estado !== 'abierto'" @reload="cargarDatos(auth.usuarioActual.value?.puestoId || '')" />
      </div>

      <div class="space-y-4">
        <UCard class="bg-primary/5 border-primary">
          <div class="flex justify-between items-center">
            <span class="font-semibold">Total esperado en caja</span>
            <span class="text-2xl font-mono font-bold text-primary">{{ fmtPrecio(totalEsperado) }}</span>
          </div>
        </UCard>

        <CuadreFiadoCard
          v-if="!esTrabajador"
          :cuadre-id="cuadre?.id ?? ''"
          :productos-activos="productosActivos"
          :puesto-id="auth.usuarioActual.value?.puestoId ?? ''"
          :readonly="cuadre?.estado !== 'abierto'"
          @actualizado="cargarDatos(auth.usuarioActual.value?.puestoId || '')"
        />
        <CuadreCierreForm v-if="cuadre?.estado === 'abierto' && !esTrabajador" />
        <CuadreResumenCerrado v-if="cuadre?.estado === 'cerrado'" :cuadre="cuadre" />
      </div>
    </div>
  </BaseHeaderPage>
</template>
