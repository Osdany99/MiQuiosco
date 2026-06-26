<script setup lang="ts">
definePageMeta({
  middleware: 'trabajador'
})

const auth = useAuth()
const localDb = useLocalDb()
const toast = useToast()

interface ProductoCache {
  id: string
  nombre: string
  precioVentaActual: number
  orden: number
}

interface LineaRegistro {
  id: string
  registroId: string
  productoId: string
  cantidad: number
  precioAnotado: number
}

interface Registro {
  id: string
  fecha: string
  trabajadorId: string
  exportado: boolean
  exportadoEn: number | null
  creadoEn: number
}

const hoy = new Date().toISOString().split('T')[0]

const productosCache = ref<ProductoCache[]>([])
const lineas = ref<LineaRegistro[]>([])
const registro = ref<Registro | null>(null)
const cargando = ref(false)
const showAgregar = ref(false)
const productoSeleccionado = ref<string>('')

async function cargarDatos() {
  cargando.value = true
  try {
    const trabajadorId = auth.usuarioActual.value?.id || ''
    if (!trabajadorId) return

    // Cargar productos cache
    const conn = await localDb.getConnection()
    // Placeholder: en real, query a productos_cache
    // productosCache.value = ...

    // Buscar o crear registro del día
    // Placeholder: query a registro_trabajador
    // registro.value = ...

    // Cargar líneas
    // Placeholder
  } catch (err: unknown) {
    const e = err as { message?: string }
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  } finally {
    cargando.value = false
  }
}

async function agregarLineaExtra() {
  if (!productoSeleccionado.value) {
    toast.add({ title: 'Selecciona un producto', color: 'warning' })
    return
  }
  const prod = productosCache.value.find(p => p.id === productoSeleccionado.value)
  if (!prod) return

  const lineaId = crypto.randomUUID()
  lineas.value.push({
    id: lineaId,
    registroId: registro.value?.id || '',
    productoId: prod.id,
    cantidad: 1,
    precioAnotado: prod.precioVentaActual
  })
  productoSeleccionado.value = ''
  showAgregar.value = false
}

async function exportarRegistro() {
  if (!registro.value) return

  const items = lineas.value.map((l) => {
    const prod = productosCache.value.find(p => p.id === l.productoId)
    return {
      producto_id: l.productoId,
      nombre_producto: prod?.nombre || '—',
      cantidad: l.cantidad,
      precio_anotado: l.precioAnotado
    }
  })

  const exportData = {
    version: 1,
    fecha: hoy,
    trabajador_id: auth.usuarioActual.value?.id || '',
    trabajador_nombre: auth.usuarioActual.value?.nombre || '',
    items
  }

  const jsonStr = JSON.stringify(exportData, null, 2)
  const fileName = `registro-${auth.usuarioActual.value?.nombre}-${hoy}.json`

  try {
    // Escribir archivo
    const { Filesystem } = await import('@capacitor/filesystem')
    await Filesystem.writeFile({
      path: fileName,
      data: jsonStr,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })

    // Compartir
    const { Share } = await import('@capacitor/share')
    await Share.share({
      title: 'Registro de ventas',
      text: `Registro de ${auth.usuarioActual.value?.nombre} del ${hoy}`,
      url: `file://${fileName}`,
      dialogTitle: 'Exportar registro'
    })

    // Marcar como exportado
    // await actualizarRegistro({ exportado: true, exportadoEn: Date.now() })

    toast.add({ title: 'Exportado', description: 'Archivo listo para compartir.', color: 'success' })
  } catch (err: unknown) {
    const e = err as { message?: string }
    toast.add({ title: 'Error al exportar', description: e.message, color: 'error' })
  }
}

async function actualizarCatalogo() {
  // Descargar catálogo del servidor
  toast.add({ title: 'Actualizando catálogo...', color: 'info' })
  // await useSync().descargarCatalogo()
  await cargarDatos()
}

function fmtMoneda(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

function getProductoNombre(productoId: string) {
  return productosCache.value.find(p => p.id === productoId)?.nombre || '—'
}

onMounted(cargarDatos)
</script>

<template>
  <div class="space-y-4">
    <UPageHeader
      title="Mi registro del día"
      :description="hoy"
      leading-icon="i-lucide-edit-3"
      class="pb-0"
    >
      <template #trailing>
        <UButton
          variant="outline"
          icon="i-lucide-download"
          label="Actualizar catálogo"
          :loading="cargando"
          @click="actualizarCatalogo"
        />
      </template>
    </UPageHeader>

    <UCard>
      <UTable
        :rows="lineas"
        :columns="[
          { key: 'producto', label: 'Producto' },
          { key: 'precioAnotado', label: 'Precio' },
          { key: 'cantidad', label: 'Cant.' },
          { key: 'subtotal', label: 'Subtotal' }
        ]"
      >
        <template #producto="{ row }">
          <span class="font-medium">{{ getProductoNombre(row.productoId) }}</span>
        </template>
        <template #precioAnotado="{ row }">
          <UInputNumber
            v-model="row.precioAnotado"
            :min="0"
            :step="10"
            size="sm"
            class="w-28"
          />
        </template>
        <template #cantidad="{ row }">
          <UInputNumber
            v-model="row.cantidad"
            :min="0"
            :step="0.5"
            size="sm"
            class="w-20"
          />
        </template>
        <template #subtotal="{ row }">
          <span class="font-mono font-semibold">
            {{ fmtMoneda(row.precioAnotado * row.cantidad) }}
          </span>
        </template>
      </UTable>

      <div v-if="showAgregar" class="flex items-center gap-2 p-2 border-t">
        <USelectMenu
          v-model="productoSeleccionado"
          :items="productosCache.map(p => ({ label: p.nombre, value: p.id }))"
          placeholder="Seleccionar producto..."
          class="w-48"
        />
        <UButton icon="i-lucide-plus" size="sm" @click="agregarLineaExtra">
          Agregar
        </UButton>
        <UButton variant="ghost" size="sm" @click="showAgregar = false">
          Cancelar
        </UButton>
      </div>
      <div v-else class="p-2 text-right">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-plus"
          @click="showAgregar = true"
        >
          Agregar producto
        </UButton>
      </div>
    </UCard>

    <UCard class="border-dashed">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-medium">
            Exportar registro de hoy
          </h4>
          <p class="text-sm text-muted">
            Genera un archivo JSON para compartir con la jefa (WhatsApp, Bluetooth, etc.).
          </p>
        </div>
        <UButton
          color="success"
          icon="i-lucide-upload"
          label="Exportar JSON"
          :loading="cargando"
          @click="exportarRegistro"
        />
      </div>
    </UCard>
  </div>
</template>
