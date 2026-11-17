<script setup>
import { evaluarCambio } from '#shared/voz/evaluarCambio'
import { FRASES_DORADAS } from '#shared/voz/frasesDoradas'
import { useVozLexico } from '../../composables/useVozLexico'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const api = useAdminApi()
const { lexico: lexicoVoz } = useVozLexico()

const filas = ref([])
const cargando = ref(false)
const route = useRoute()
const nueva = ref({ categoria: 'venta_fuerte', valor: '', nota: '' })
/** Plantilla de referencia que llega desde «Usar plantilla» (/admin/voz). */
const plantillaRef = ref('')
const prueba = ref({ categoria: 'venta_fuerte', valor: '', plantillas: '' })
const resultadoPrueba = ref(null)

function probar() {
  try {
    const entrada = { categoria: prueba.value.categoria, valor: prueba.value.valor, activo: true }
    const plantillas = prueba.value.plantillas.split('\n').map(x => x.trim()).filter(Boolean)
    // Se prueba contra el léxico efectivo (base + entradas activas), no solo
    // contra LEXICO_BASE: es lo que el reconocimiento usa de verdad.
    resultadoPrueba.value = evaluarCambio(lexicoVoz.value, entrada, { frasesDoradas: FRASES_DORADAS, plantillas })
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error al probar.', color: 'error' })
  }
}

const categorias = ['venta_fuerte', 'venta_debil', 'consulta_marca']

const columnas = [
  { accessorKey: 'categoria', header: 'Categoría' },
  { accessorKey: 'valor', header: 'Valor' },
  { accessorKey: 'activo', header: 'Activo' },
  { accessorKey: 'version', header: 'Versión' },
  { accessorKey: 'acciones', header: '' }
]

async function cargar() {
  cargando.value = true
  try {
    filas.value = await api.listarLexicoVoz()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  } finally {
    cargando.value = false
  }
}

async function crear() {
  if (!nueva.value.valor) return
  try {
    await api.crearEntradaLexicoVoz({ ...nueva.value })
    nueva.value.valor = ''
    nueva.value.nota = ''
    await cargar()
    toast.add({ title: 'Voz', description: 'Entrada creada.', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  }
}

async function alternar(fila) {
  try {
    await api.actualizarEntradaLexicoVoz(fila.id, { activo: !fila.activo })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  }
}

onMounted(() => {
  const plantillaQuery = route.query.plantilla
  const valorQuery = route.query.valor
  if (plantillaQuery) {
    // La plantilla es una frase enmascarada («vende <n> <producto>»), no una
    // palabra: se deja como referencia y en la nota. Solo se precarga el valor
    // si la plantilla entera cabe como palabra del léxico.
    const plantilla = String(plantillaQuery).trim()
    plantillaRef.value = plantilla
    nueva.value.nota = `Plantilla: ${plantilla}`.slice(0, 120)
    const candidata = plantilla.replace(/[<>]/g, ' ').trim()
    if (/^[a-z]{2,24}$/.test(candidata)) nueva.value.valor = candidata
  } else if (valorQuery) {
    nueva.value.valor = String(valorQuery)
  }
  void cargar()
})
</script>

<template>
  <BaseHeaderPage
    title="Léxico de voz"
    description="Sinónimos que el reconocimiento acepta además del vocabulario base."
    leading-icon="i-lucide-book"
    :show-button="false"
  >
    <template #trailing>
      <span class="text-sm text-muted">{{ filas.length }} entradas</span>
      <UButton
        icon="i-lucide-refresh-cw"
        variant="outline"
        label="Actualizar"
        :loading="cargando"
        @click="cargar"
      />
    </template>

    <div class="flex flex-col gap-2 md:flex-row md:items-end">
      <USelect v-model="nueva.categoria" :items="categorias" class="w-56" />
      <UInput v-model="nueva.valor" placeholder="palabra" class="w-48" />
      <UInput v-model="nueva.nota" placeholder="nota" class="w-48" />
      <UButton @click="crear">
        Añadir
      </UButton>
    </div>

    <UAlert
      v-if="plantillaRef"
      color="info"
      variant="soft"
      icon="i-lucide-info"
      class="mt-2"
      title="Plantilla de referencia"
      :description="`«${plantillaRef}» es el dictado que no se reconoció. Añade la palabra concreta que falte (no la frase entera).`"
    />

    <BaseTable
      :data="filas"
      :columns="columnas"
      :loading-prop="cargando"
      :show-edit="false"
      :show-delete="false"
      :pagination="false"
      empty-state="Sin entradas."
      @reload="cargar"
    >
      <template #valor-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.valor }}</span>
      </template>

      <template #activo-cell="{ row }">
        <UBadge
          :color="row.original.activo ? 'success' : 'neutral'"
          variant="soft"
          size="sm"
          :label="row.original.activo ? 'Sí' : 'No'"
        />
      </template>

      <template #acciones-cell="{ row }">
        <UButton size="xs" variant="outline" @click="alternar(row.original)">
          {{ row.original.activo ? 'Desactivar' : 'Activar' }}
        </UButton>
      </template>
    </BaseTable>

    <div class="mt-6 space-y-2 border rounded p-4">
      <h2 class="font-semibold">
        Probar entrada
      </h2>
      <div class="flex flex-col gap-2 md:flex-row md:items-end">
        <USelect v-model="prueba.categoria" :items="categorias" class="w-56" />
        <UInput v-model="prueba.valor" placeholder="palabra" class="w-48" />
        <UTextarea v-model="prueba.plantillas" placeholder="plantillas (una por línea)" class="w-64" />
        <UButton @click="probar">
          Probar
        </UButton>
      </div>
      <div v-if="resultadoPrueba">
        <p>Regresiones: {{ resultadoPrueba.regresiones.length }}</p>
        <p>Cambios en plantillas: {{ resultadoPrueba.cambios.length }}</p>
        <ul v-if="resultadoPrueba.regresiones.length">
          <li v-for="(r, i) in resultadoPrueba.regresiones" :key="i" class="text-error text-xs">
            {{ r.frase }}: {{ r.antes }} → {{ r.despues }}
          </li>
        </ul>
      </div>
    </div>
  </BaseHeaderPage>
</template>
