<script setup>
definePageMeta({
  // Sin middleware de rol — auth.global.js ya verifica sesión.
  // El control de acceso por rol se maneja en el template (v-if esTrabajador).
})

const auth = useAuth()
const {
  cuadre, cargando, totalEsperado, hoy,
  cerrarCuadre, reabrirCuadre, cargarDatos, fmtMoneda,
  esTrabajador
} = useCuadre()

onMounted(() => {
  console.log('esTrabajador:', esTrabajador.value)
  console.log('esJefe:', auth.esJefe.value)
  cargarDatos(auth.usuarioActual.value?.puestoId || '')
})
</script>

<template>
  <BaseHeaderPage
    title="Cuadre del día"
    :description="hoy"
    leading-icon="i-lucide-clipboard-check"
    :show-button="false"
  >
    <template v-if="!esTrabajador" #trailing>
      <UButton
        v-if="cuadre?.estado === 'cerrado'"
        variant="outline"
        color="warning"
        icon="i-lucide-rotate-ccw"
        label="Reabrir"
        @click="reabrirCuadre"
      />
      <UButton
        v-if="cuadre?.estado === 'abierto'"
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
            <span class="text-2xl font-mono font-bold text-primary">{{ fmtMoneda(totalEsperado) }}</span>
          </div>
        </UCard>

        <CuadreCierreForm v-if="cuadre?.estado === 'abierto' && !esTrabajador" />
        <CuadreResumenCerrado v-if="cuadre?.estado === 'cerrado'" :cuadre="cuadre" />
        <CuadreImportarTrabajador v-if="!esTrabajador" />
      </div>
    </div>
  </BaseHeaderPage>
</template>
