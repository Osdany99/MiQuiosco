<script setup lang="ts">
definePageMeta({
  middleware: 'admin'
})

const auth = useAuth()
const toast = useToast()

interface Producto {
  id: string
  nombre: string
  descripcion: string | null
  activo: boolean
  orden: number
  precioCompraActual: number
  precioVentaActual: number
}

const productos = ref<Producto[]>([])
const cargando = ref(false)
const showModal = ref(false)
const editando = ref<Producto | null>(null)
const showHistorial = ref(false)
const historialProducto = ref<Producto | null>(null)
const historial = ref<Array<{ id: string, precioCompra: number, precioVenta: number, vigenteDesde: string, vigenteHasta: string | null, cambiadoPor: string | null }>>([])

const form = reactive<Partial<Producto>>({
  nombre: '',
  descripcion: '',
  precioCompraActual: 0,
  precioVentaActual: 0,
  orden: 0,
  activo: true
})
const formError = ref<string | null>(null)

async function cargarProductos() {
  cargando.value = true
  try {
    const data = await $fetch<Producto[]>('/api/productos')
    productos.value = data
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({
      title: 'Error',
      description: e.data?.statusMessage || e.statusMessage || e.message || 'No se pudieron cargar los productos.',
      color: 'error'
    })
  } finally {
    cargando.value = false
  }
}

async function onSubmit() {
  formError.value = null

  if (!form.nombre?.trim()) {
    formError.value = 'El nombre es obligatorio.'
    return
  }

  if (form.precioCompraActual === undefined || form.precioCompraActual < 0) {
    formError.value = 'El precio de compra es obligatorio y debe ser >= 0.'
    return
  }

  if (form.precioVentaActual === undefined || form.precioVentaActual < 0) {
    formError.value = 'El precio de venta es obligatorio y debe ser >= 0.'
    return
  }

  try {
    if (editando.value) {
      await $fetch(`/api/productos/${editando.value.id}`, {
        method: 'PATCH',
        body: {
          nombre: form.nombre,
          descripcion: form.descripcion,
          precioCompraActual: form.precioCompraActual,
          precioVentaActual: form.precioVentaActual,
          orden: form.orden,
          activo: form.activo
        }
      })
      toast.add({ title: 'Actualizado', description: 'Producto modificado correctamente.', color: 'success' })
    } else {
      await $fetch('/api/productos', {
        method: 'POST',
        body: {
          nombre: form.nombre,
          descripcion: form.descripcion,
          precioCompraActual: form.precioCompraActual,
          precioVentaActual: form.precioVentaActual,
          orden: form.orden,
          activo: form.activo
        }
      })
      toast.add({ title: 'Creado', description: 'Producto creado correctamente.', color: 'success' })
    }
    showModal.value = false
    await cargarProductos()
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    formError.value = e.data?.statusMessage || e.statusMessage || e.message || 'Error al guardar.'
  }
}

async function verHistorial(p: Producto) {
  historialProducto.value = p
  try {
    const data = await $fetch<typeof historial.value>(`/api/productos/${p.id}/historial-precios`)
    historial.value = data
    showHistorial.value = true
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.statusMessage || e.message, color: 'error' })
  }
}

function abrirModalCrear() {
  editando.value = null
  form.nombre = ''
  form.descripcion = ''
  form.precioCompraActual = 0
  form.precioVentaActual = 0
  form.orden = productos.value.length
  form.activo = true
  formError.value = null
  showModal.value = true
}

function abrirModalEditar(p: Producto) {
  editando.value = p
  form.nombre = p.nombre
  form.descripcion = p.descripcion ?? ''
  form.precioCompraActual = p.precioCompraActual
  form.precioVentaActual = p.precioVentaActual
  form.orden = p.orden
  form.activo = p.activo
  formError.value = null
  showModal.value = true
}

async function toggleActivo(p: Producto) {
  try {
    await $fetch(`/api/productos/${p.id}`, {
      method: 'PATCH',
      body: { activo: !p.activo }
    })
    await cargarProductos()
    toast.add({ title: 'Actualizado', description: `Producto ${!p.activo ? 'activado' : 'desactivado'}.`, color: 'success' })
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string }, statusMessage?: string, message?: string }
    toast.add({ title: 'Error', description: e.data?.statusMessage || e.statusMessage || e.message, color: 'error' })
  }
}

async function moverArriba(p: Producto) {
  const idx = productos.value.findIndex(x => x.id === p.id)
  if (idx > 0) {
    const a = productos.value[idx]
    const b = productos.value[idx - 1]
    await Promise.all([
      $fetch(`/api/productos/${a.id}`, { method: 'PATCH', body: { orden: b.orden } }),
      $fetch(`/api/productos/${b.id}`, { method: 'PATCH', body: { orden: a.orden } })
    ])
    await cargarProductos()
  }
}

async function moverAbajo(p: Producto) {
  const idx = productos.value.findIndex(x => x.id === p.id)
  if (idx < productos.value.length - 1) {
    const a = productos.value[idx]
    const b = productos.value[idx + 1]
    await Promise.all([
      $fetch(`/api/productos/${a.id}`, { method: 'PATCH', body: { orden: b.orden } }),
      $fetch(`/api/productos/${b.id}`, { method: 'PATCH', body: { orden: a.orden } })
    ])
    await cargarProductos()
  }
}

onMounted(cargarProductos)

const columns = [
  { key: 'orden', label: 'Orden', sortable: true },
  { key: 'nombre', label: 'Producto' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'precioCompraActual', label: 'Precio Compra' },
  { key: 'precioVentaActual', label: 'Precio Venta' },
  { key: 'activo', label: 'Estado' },
  { key: 'actions', label: '' }
]

function fmtPrecio(v: number) {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v)
}
</script>

<template>
  <div class="space-y-4">
    <UPageHeader title="Productos" description="Catálogo de productos del puesto" leading-icon="i-lucide-package" class="pb-0">
      <template #trailing>
        <UButton @click="abrirModalCrear" icon="i-lucide-plus" label="Nuevo producto" />
      </template>
    </UPageHeader>

    <UCard>
      <UTable
        :rows="productos"
        :columns="columns"
        :loading="cargando"
        striped
      >
        <template #orden="{ row }">
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-chevron-up"
              variant="ghost"
              size="xs"
              @click="moverArriba(row)"
              :disabled="row.orden === 0"
            />
            <span class="font-mono">{{ row.orden }}</span>
            <UButton
              icon="i-lucide-chevron-down"
              variant="ghost"
              size="xs"
              @click="moverAbajo(row)"
            />
          </div>
        </template>
        <template #precioCompraActual="{ row }">
          {{ fmtPrecio(row.precioCompraActual) }}
        </template>
        <template #precioVentaActual="{ row }">
          {{ fmtPrecio(row.precioVentaActual) }}
        </template>
        <template #activo="{ row }">
          <USwitch
            v-model="row.activo"
            @update:model-value="toggleActivo(row)"
            size="sm"
          />
        </template>
        <template #actions="{ row }">
          <UButtonGroup>
            <UButton
              icon="i-lucide-edit-2"
              variant="ghost"
              size="sm"
              @click="abrirModalEditar(row)"
            />
            <UButton
              icon="i-lucide-clock"
              variant="ghost"
              size="sm"
              @click="verHistorial(row)"
            />
          </UButtonGroup>
        </template>
      </UTable>
    </UCard>

    <UModal v-model="showModal" :ui="{ width: 'max-w-lg' }">
      <template #header>
        {{ editando.value ? 'Editar producto' : 'Nuevo producto' }}
      </template>

      <UForm :state="form" class="space-y-4" @submit="onSubmit">
        <UFormField label="Nombre" required>
          <UInput v-model="form.nombre" placeholder="Nombre del producto" />
        </UFormField>

        <UFormField label="Descripción">
          <UInput v-model="form.descripcion" placeholder="Descripción opcional" />
        </UFormField>

        <div class="grid grid-cols-2 gap-4">
          <UFormField label="Precio compra" required>
            <UInputNumber
              v-model="form.precioCompraActual"
              :min="0"
              :step="100"
              placeholder="0"
            />
          </UFormField>

          <UFormField label="Precio venta" required>
            <UInputNumber
              v-model="form.precioVentaActual"
              :min="0"
              :step="100"
              placeholder="0"
            />
          </UFormField>
        </div>

        <UFormField label="Orden">
          <UInputNumber
            v-model="form.orden"
            :min="0"
            :step="1"
            placeholder="0"
          />
        </UFormField>

        <UFormField v-if="editando.value" label="Activo">
          <USwitch v-model="form.activo" />
        </UFormField>

        <UAlert v-if="formError" color="error" icon="i-lucide-alert-circle" :title="formError" />

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" label="Cancelar" @click="showModal.value = false" />
            <UButton type="submit" :loading="cargando" label="Guardar" />
          </div>
        </template>
      </UForm>
    </UModal>

    <UModal v-model="showHistorial" :ui="{ width: 'max-w-lg' }">
      <template #header>
        Historial de precios - {{ historialProducto?.nombre }}
      </template>

      <UCard>
        <UTable
          :rows="historial"
          :columns="[
            { key: 'vigenteDesde', label: 'Desde' },
            { key: 'vigenteHasta', label: 'Hasta' },
            { key: 'precioCompra', label: 'Precio compra' },
            { key: 'precioVenta', label: 'Precio venta' }
          ]"
        >
          <template #vigenteDesde="{ row }">
            {{ new Date(row.vigenteDesde).toLocaleDateString('es-ES') }}
          </template>
          <template #vigenteHasta="{ row }">
            {{ row.vigenteHasta ? new Date(row.vigenteHasta).toLocaleDateString('es-ES') : 'Vigente' }}
          </template>
          <template #precioCompra="{ row }">
            {{ fmtPrecio(row.precioCompra) }}
          </template>
          <template #precioVenta="{ row }">
            {{ fmtPrecio(row.precioVenta) }}
          </template>
        </UTable>
      </UCard>

      <template #footer>
        <div class="flex justify-end">
          <UButton variant="ghost" label="Cerrar" @click="showHistorial.value = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>
