<script setup lang="ts">
definePageMeta({
  middleware: 'jefe'
})

const auth = useAuth()
const localDb = useLocalDb()
const toast = useToast()

interface Producto {
  id: string
  nombre: string
  precioVentaActual: number
  orden: number
}

interface LineaCuadre {
  id: string
  cuadreId: string
  productoId: string
  precioVentaUsado: number
  cantidad: number
  subtotal: number
  tipoLinea: 'normal' | 'regalo' | 'descuento_familiar'
  nota: string | null
  esExtra: boolean
}

interface Cuadre {
  id: string
  fecha: string
  estado: 'abierto' | 'cerrado'
  totalEsperado: number
  totalRealCaja: number | null
  montoTransferencia: number
  montoFiado: number
  diferencia: number | null
  trabajadorTurnoId: string | null
  pagoTrabajador: number | null
  notas: string | null
  cerradoEn: string | number | null
  reabiertoVeces: number
  ultimaReaperturaEn: string | number | null
}

const hoy = new Date().toISOString().split('T')[0]

const cuadre = ref<Cuadre | null>(null)
const lineas = ref<LineaCuadre[]>([])
const productosActivos = ref<Producto[]>([])
const cargando = ref(false)
const showImportar = ref(false)
const showAgregarProducto = ref(false)
const productoSeleccionado = ref<string>('')
const expandida = ref<Set<string>>(new Set())

const totalRealCaja = ref<number | null>(null)
const montoTransferencia = ref(0)
const montoFiado = ref(0)
const trabajadorTurnoId = ref<string | null>(null)
const pagoTrabajador = ref<number | null>(null)
const notasCuadre = ref('')

// Computados reactivos
const totalEsperado = computed(() =>
  lineas.value.reduce((sum, l) => sum + l.subtotal, 0)
)

const diferencia = computed(() => {
  if (totalRealCaja.value === null) return null
  return (totalRealCaja.value + montoTransferencia.value) - totalEsperado.value
})

const tipoDiferencia = computed((): 'exacto' | 'sobrante' | 'faltante' | null => {
  if (diferencia.value === null) return null
  if (diferencia.value === 0) return 'exacto'
  return diferencia.value > 0 ? 'sobrante' : 'faltante'
})

async function cargarDatos() {
  cargando.value = true
  try {
    const puestoId = auth.usuarioActual.value?.puestoId || ''
    if (!puestoId) return

    // Cargar productos activos para el selector
    const prods = await localDb.getProductosActivos(puestoId)
    productosActivos.value = prods.map(p => ({
      id: p.id,
      nombre: p.nombre,
      precioVentaActual: p.precioVentaActual,
      orden: p.orden
    }))

    // Buscar o crear cuadre del día
    let c = await localDb.getCuadrePorFecha(puestoId, hoy)
    if (!c) {
      // Crear cuadre nuevo con líneas precargadas
      c = await crearCuadreNuevo(puestoId)
    }

    cuadre.value = c

    // Cargar líneas
    if (c.id) {
      const items = await localDb.getItemsDeCuadre(c.id)
      lineas.value = items.map(i => ({
        id: i.id,
        cuadreId: i.cuadreId,
        productoId: i.productoId,
        precioVentaUsado: i.precioVentaUsado,
        cantidad: i.cantidad,
        subtotal: i.subtotal,
        tipoLinea: i.tipoLinea,
        nota: i.nota,
        esExtra: i.esExtra
      }))
    }

    // Poblar campos de cierre si ya existen
    if (c.totalRealCaja !== undefined !== undefined && c.totalRealC !== null) totalRealCaja.value = c.totalRealC
    if (c.montoTransferencia !== undefined) montoTransferencia.value = c.montoTransferencia
    if (c.montoFiado !== undefined) montoFiado.value = c.montoFiado
    if (c.trabajadorTurnoId !== undefined) trabajadorTurnoId.value = c.trabajadorTurnoId
    if (c.pagoTrabajador !== undefined) pagoTrabajador.value = c.pagoTrabajador
    if (c.notas !== undefined) notasCuadre.value = c.notas ?? ''
  } catch (err: unknown) {
    const e = err as { message?: string }
    toast.add({ title: 'Error', description: e.message || 'No se pudo cargar el cuadre.', color: 'error' })
  } finally {
    cargando.value = false
  }
}

async function crearCuadreNuevo(puestoId: string): Promise<Cuadre> {
  // En implementación real: insertar en SQLite y devolver el creado
  // Aquí simulamos el objeto
  const nuevoId = crypto.randomUUID()

  // Pre-cargar líneas para cada producto activo
  for (const prod of productosActivos.value) {
    const lineaId = crypto.randomUUID()
    lineas.value.push({
      id: lineaId,
      cuadreId: nuevoId,
      productoId: prod.id,
      precioVentaUsado: prod.precioVentaActual,
      cantidad: 0,
      subtotal: 0,
      tipoLinea: 'normal',
      nota: null,
      esExtra: false
    })
  }

  return {
    id: nuevoId,
    fecha: hoy,
    estado: 'abierto',
    totalEsperado: 0,
    totalRealCaja: null,
    montoTransferencia: 0,
    montoFiado: 0,
    diferencia: null,
    trabajadorTurnoId: null,
    pagoTrabajador: null,
    notas: null,
    cerradoEn: null,
    reabiertoVeces: 0,
    ultimaReaperturaEn: null
  }
}

function recalcularSubtotal(linea: LineaCuadre) {
  linea.subtotal = linea.precioVentaUsado * linea.cantidad
}

async function agregarLineaExtra() {
  if (!productoSeleccionado.value) {
    toast.add({ title: 'Selecciona un producto', color: 'warning' })
    return
  }
  const prod = productosActivos.value.find(p => p.id === productoSeleccionado.value)
  if (!prod) return

  const lineaId = crypto.randomUUID()
  lineas.value.push({
    id: lineaId,
    cuadreId: cuadre.value!.id,
    productoId: prod.id,
    precioVentaUsado: prod.precioVentaActual,
    cantidad: 1,
    subtotal: prod.precioVentaActual,
    tipoLinea: 'normal',
    nota: null,
    esExtra: true
  })
  productoSeleccionado.value = ''
  showAgregarProducto.value = false
}

function toggleExpandir(lineaId: string) {
  if (expandida.value.has(lineaId)) {
    expandida.value.delete(lineaId)
  } else {
    expandida.value.add(lineaId)
  }
}

async function cerrarCuadre() {
  if (totalRealCaja.value === null) {
    toast.add({ title: 'Debes ingresar el dinero real en caja.', color: 'warning' })
    return
  }

  if (!cuadre.value) return

  const diff = diferencia.value ?? 0
  const tipo = tipoDiferencia.value

  try {
    // En implementación real: actualizar SQLite
    cuadre.value = {
      ...cuadre.value,
      estado: 'cerrado',
      totalEsperado: totalEsperado.value,
      totalRealCaja: totalRealCaja.value,
      montoTransferencia: montoTransferencia.value,
      montoFiado: montoFiado.value,
      diferencia: diff,
      trabajadorTurnoId: trabajadorTurnoId.value,
      pagoTrabajador: pagoTrabajador.value,
      notas: notasCuadre.value,
      cerradoEn: Date.now()
    }

    let mensaje = 'Cuadre cerrado: '
    if (tipo === 'exacto') mensaje += 'todo correcto, caja exacta.'
    else if (tipo === 'sobrante') mensaje += `sobrante de ${fmtMoneda(diff)}.`
    else mensaje += `faltante de ${fmtMoneda(-diff)}.`

    toast.add({ title: 'Cuadre cerrado', description: mensaje, color: tipo === 'exacto' ? 'success' : tipo === 'sobrante' ? 'info' : 'error' })
  } catch (err: unknown) {
    const e = err as { message?: string }
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
}

async function reabrirCuadre() {
  if (!cuadre.value || cuadre.value.estado !== 'cerrado') return

  cuadre.value = {
    ...cuadre.value,
    estado: 'abierto',
    reabiertoVeces: cuadre.value.reabiertoVeces + 1,
    ultimaReaperturaEn: Date.now()
  }
  toast.add({ title: 'Cuadre reabierto', description: 'Ahora puedes editarlo nuevamente.', color: 'info' })
}

async function importarRegistroTrabajador() {
  // Placeholder para file picker
  toast.add({ title: 'Función en desarrollo', description: 'Selector de archivo JSON próximamente.', color: 'info' })
  showImportar.value = false
}

function fmtMoneda(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}

function getProductoNombre(productoId: string) {
  return productosActivos.value.find(p => p.id === productoId)?.nombre || '—'
}

// function getTipoLineaLabel(t: string) {
//   return t === 'normal' ? 'Normal' : t === 'regalo' ? 'Regalo' : 'Desc. familiar'
// }

onMounted(cargarDatos)
</script>

<template>
  <div class="space-y-4">
    <UPageHeader
      title="Cuadre del día"
      :description="hoy"
      leading-icon="i-lucide-clipboard-check"
      class="pb-0"
    >
      <template #trailing>
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
    </UPageHeader>

    <!-- Tabla de líneas -->
    <UCard>
      <UTable
        :rows="lineas"
        :columns="[
          { key: 'producto', label: 'Producto' },
          { key: 'precioVentaUsado', label: 'Precio venta' },
          { key: 'cantidad', label: 'Cant.' },
          { key: 'tipoLinea', label: 'Tipo' },
          { key: 'subtotal', label: 'Subtotal' },
          { key: 'actions', label: '' }
        ]"
      >
        <template #producto="{ row }">
          <div class="flex items-center gap-2">
            <span class="font-medium">{{ getProductoNombre(row.productoId) }}</span>
            <UBadge
              v-if="row.esExtra"
              label="Extra"
              color="amber"
              size="xs"
            />
            <UButton
              v-if="expandida.has(row.id)"
              icon="i-lucide-chevron-up"
              variant="ghost"
              size="xs"
              @click="toggleExpandir(row.id)"
            />
            <UButton
              v-else
              icon="i-lucide-chevron-down"
              variant="ghost"
              size="xs"
              @click="toggleExpandir(row.id)"
            />
          </div>
        </template>

        <template #precioVentaUsado="{ row }">
          <UInputNumber
            v-model="row.precioVentaUsado"
            :min="0"
            :step="10"
            size="sm"
            class="w-28"
            @update:model-value="() => recalcularSubtotal(row)"
          />
        </template>

        <template #cantidad="{ row }">
          <UInputNumber
            v-model="row.cantidad"
            :min="0"
            :step="0.5"
            size="sm"
            class="w-20"
            @update:model-value="() => recalcularSubtotal(row)"
          />
        </template>

        <template #tipoLinea="{ row }">
          <USelectMenu
            v-model="row.tipoLinea"
            :items="[
              { label: 'Normal', value: 'normal' },
              { label: 'Regalo', value: 'regalo' },
              { label: 'Desc. familiar', value: 'descuento_familiar' }
            ]"
            size="sm"
            class="w-36"
          />
        </template>

        <template #subtotal="{ row }">
          <span class="font-mono font-semibold">{{ fmtMoneda(row.subtotal) }}</span>
        </template>

        <template #actions="{ row }">
          <div v-if="expandida.has(row.id)" class="flex flex-col gap-1 mt-2 ml-12 border-l-2 pl-2">
            <UInput
              v-model="row.nota"
              placeholder="Nota libre (opcional)"
              size="sm"
              class="w-64"
            />
          </div>
        </template>
      </UTable>

      <!-- Fila para agregar producto extra -->
      <div v-if="showAgregarProducto" class="flex items-center gap-2 p-2 border-t">
        <USelectMenu
          v-model="productoSeleccionado"
          :items="productosActivos.map(p => ({ label: p.nombre, value: p.id }))"
          placeholder="Seleccionar producto..."
          class="w-48"
        />
        <UButton icon="i-lucide-plus" size="sm" @click="agregarLineaExtra">
          Agregar
        </UButton>
        <UButton variant="ghost" size="sm" @click="showAgregarProducto = false">
          Cancelar
        </UButton>
      </div>
      <div v-else class="p-2 text-right">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-plus"
          @click="showAgregarProducto = true"
        >
          Agregar producto extra
        </UButton>
      </div>
    </UCard>

    <!-- Total esperado (solo lectura) -->
    <UCard class="bg-primary/5 border-primary">
      <div class="flex justify-between items-center">
        <span class="font-semibold">Total esperado en caja</span>
        <span class="text-2xl font-mono font-bold text-primary">{{ fmtMoneda(totalEsperado) }}</span>
      </div>
    </UCard>

    <!-- Sección cierre de caja -->
    <UCard v-if="cuadre?.estado === 'abierto'">
      <template #header>
        <h3 class="font-semibold">
          Cierre de caja
        </h3>
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Dinero real en caja" required>
            <UInputNumber
              v-model="totalRealCaja"
              :min="0"
              :step="100"
              placeholder="0"
            />
          </UFormField>

          <UFormField label="Monto en transferencia">
            <UInputNumber
              v-model="montoTransferencia"
              :min="0"
              :step="100"
              placeholder="0"
            />
          </UFormField>
        </div>

        <UFormField label="Monto fiado / por cobrar">
          <UInputNumber
            v-model="montoFiado"
            :min="0"
            :step="100"
            placeholder="0"
          />
        </UFormField>

        <UFormField label="Trabajador de turno">
          <USelectMenu
            v-model="trabajadorTurnoId"
            :items="[
              { label: 'Sin asignar', value: '' },
              { label: 'Juan', value: 'trabajador-1' },
              { label: 'María', value: 'trabajador-2' }
            ]"
            placeholder="Seleccionar..."
          />
        </UFormField>

        <UFormField label="Pago al trabajador">
          <UInputNumber
            v-model="pagoTrabajador"
            :min="0"
            :step="100"
            placeholder="0"
          />
        </UFormField>

        <UFormField label="Notas">
          <UTextarea
            v-model="notasCuadre"
            placeholder="Observaciones del cierre..."
            :rows="3"
          />
        </UFormField>

        <!-- Diferencia calculada -->
        <div
          class="flex items-center justify-between p-4 rounded-lg"
          :class="{
            'bg-green-100 text-green-800': tipoDiferencia === 'exacto',
            'bg-blue-100 text-blue-800': tipoDiferencia === 'sobrante',
            'bg-red-100 text-red-800': tipoDiferencia === 'faltante',
            'bg-gray-100 text-gray-600': tipoDiferencia === null
          }"
        >
          <span class="font-semibold">
            {{ tipoDiferencia === 'exacto' ? '✓ Cuadre exacto'
              : tipoDiferencia === 'sobrante' ? '▲ Sobrante'
                : tipoDiferencia === 'faltante' ? '▼ Faltante'
                  : '— Ingresa dinero real en caja' }}
          </span>
          <span v-if="diferencia !== null" class="text-xl font-mono font-bold">
            {{ fmtMoneda(diferencia) }}
          </span>
        </div>
      </div>
    </UCard>

    <!-- Cuadre cerrado: solo lectura -->
    <UCard v-if="cuadre?.estado === 'cerrado'">
      <template #header>
        <h3 class="font-semibold text-success">
          Cuadre cerrado
        </h3>
      </template>

      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span>Total esperado:</span><span class="font-mono">{{ fmtMoneda(cuadre.totalEsperado) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Dinero real:</span><span class="font-mono">{{ fmtMoneda(cuadre.totalRealCaja ?? 0) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Transferencia:</span><span class="font-mono">{{ fmtMoneda(cuadre.montoTransferencia) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Fiado:</span><span class="font-mono">{{ fmtMoneda(cuadre.montoFiado) }}</span>
        </div>
        <div class="flex justify-between font-bold">
          <span>Diferencia:</span><span class="font-mono">{{ fmtMoneda(cuadre.diferencia ?? 0) }}</span>
        </div>
        <div class="flex justify-between">
          <span>Trabajador:</span><span>{{ cuadre.trabajadorTurnoId || '—' }}</span>
        </div>
        <div class="flex justify-between">
          <span>Pago trabajador:</span><span>{{ cuadre.pagoTrabajador ? fmtMoneda(cuadre.pagoTrabajador) : '—' }}</span>
        </div>
        <div class="flex justify-between">
          <span>Cerrado el:</span><span>{{ cuadre.cerradoEn ? new Date(Number(cuadre.cerradoEn)).toLocaleString('es-ES') : '—' }}</span>
        </div>
        <div v-if="cuadre.notas" class="flex justify-between">
          <span>Notas:</span><span>{{ cuadre.notas }}</span>
        </div>
        <div v-if="cuadre.reabiertoVeces > 0" class="text-warning text-sm">
          ⚠ Reabierto {{ cuadre.reabiertoVeces }} vez{{ cuadre.reabiertoVeces > 1 ? 'es' : '' }} (última: {{ cuadre.ultimaReaperturaEn ? new Date(Number(cuadre.ultimaReaperturaEn)).toLocaleString('es-ES') : '—' }})
        </div>
      </div>
    </UCard>

    <!-- Importar registro trabajador -->
    <UCard class="border-dashed">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="font-medium">
            Importar registro de trabajador
          </h4>
          <p class="text-sm text-muted">
            Sobrescribe cantidades y precios con el archivo exportado por el trabajador.
          </p>
        </div>
        <UButton
          variant="outline"
          icon="i-lucide-upload"
          label="Importar JSON"
          @click="showImportar = true"
        />
      </div>
    </UCard>

    <!-- Modal importar -->
    <UModal v-model="showImportar" :ui="{ width: 'max-w-md' }">
      <template #header>
        Importar registro de trabajador
      </template>
      <div class="space-y-4">
        <UAlert color="info" icon="i-lucide-info" title="Esta acción reemplazará (no sumará) las líneas existentes que coincidan por ID de producto." />
        <UButton
          block
          variant="outline"
          icon="i-lucide-file-text"
          label="Seleccionar archivo .json"
          @click="importarRegistroTrabajador"
        />
      </div>
      <template #footer>
        <UButton variant="ghost" @click="showImportar = false">
          Cancelar
        </UButton>
      </template>
    </UModal>
  </div>
</template>
