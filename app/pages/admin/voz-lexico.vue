<script setup>
import { evaluarCambio } from '#shared/voz/evaluarCambio'
import { aliasesQueSobran } from '#shared/voz/alias'
import { FRASES_DORADAS } from '#shared/voz/frasesDoradas'
import { CATEGORIAS_LEXICO } from '#shared/schemas/vozLexico'
import { LEXICO_BASE, crearLexico } from '#shared/voz/lexico'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const api = useAdminApi()

const entradasRemotas = ref([])
const cargando = ref(false)
const route = useRoute()
const nueva = ref({ categoria: 'venta_fuerte', valor: '', nota: '' })
/** Plantilla de referencia que llega desde «Usar plantilla» (/admin/voz). */
const plantillaRef = ref('')
const prueba = ref({ categoria: 'venta_fuerte', valor: '', activo: true, plantillas: '' })
const resultadoPrueba = ref(null)

/*
 * Alias que sobran. Los alias viven en este teléfono (tabla `voz_alias`) y se
 * aprenden al elegir un producto a mano. Con las reglas nuevas, un alias que el
 * catálogo ya resuelve («maní molido» con nombre y descripción) no aporta nada.
 * Aquí se revisan y se muestran ANTES de borrar: nada se borra solo.
 */
const aliasVoz = useVozAlias()
const inventario = useInventario()
const revisandoAlias = ref(false)
const revisadoAlias = ref(false)
const aliasSobrantes = ref([])
const borrandoAlias = ref(false)

const nombrePorProducto = computed(() => {
  const mapa = new Map()
  for (const fila of inventario.saldos?.value ?? []) {
    if (fila?.productoId) mapa.set(fila.productoId, fila.nombre)
  }
  return mapa
})

async function revisarAlias() {
  if (revisandoAlias.value) return
  revisandoAlias.value = true
  try {
    await aliasVoz.cargar({ forzar: true }).catch(() => [])
    const catalogo = await inventario.cargarSaldos().catch(() => [])
    aliasSobrantes.value = aliasesQueSobran(aliasVoz.lista.value ?? [], {
      nombresProductos: (catalogo ?? []).map(f => f?.nombre).filter(Boolean),
      nombresCompletos: (catalogo ?? [])
        .map(f => [f?.nombre, f?.descripcion].filter(Boolean).join(' '))
        .filter(Boolean)
    })
    revisadoAlias.value = true
  } finally {
    revisandoAlias.value = false
  }
}

async function borrarAliasSobrantes() {
  if (borrandoAlias.value || !aliasSobrantes.value.length) return
  borrandoAlias.value = true
  let borrados = 0
  try {
    for (const fila of aliasSobrantes.value) {
      if (await aliasVoz.deshacer(fila.id)) borrados++
    }
    aliasSobrantes.value = []
    toast.add({
      title: 'Alias limpiados',
      description: `${borrados} ${borrados === 1 ? 'alias borrado' : 'alias borrados'}.`,
      color: 'success'
    })
  } finally {
    borrandoAlias.value = false
  }
}

const CAMPO = {
  venta_fuerte: 'ventaFuerte',
  venta_debil: 'ventaDebil',
  consulta_marca: 'consultaMarca'
}

/**
 * Vista fusionada: palabras base + entradas remotas. Una entrada inactiva
 * encima de una base es un tombstone y se muestra como «desactivada».
 */
const filas = computed(() => {
  const mapa = new Map()
  for (const categoria of CATEGORIAS_LEXICO) {
    for (const valor of LEXICO_BASE[CAMPO[categoria]] || []) {
      mapa.set(`${categoria}|${valor}`, {
        key: `${categoria}|${valor}`,
        id: null,
        categoria,
        valor,
        activo: true,
        base: true,
        version: null,
        nota: null
      })
    }
  }
  for (const entrada of entradasRemotas.value) {
    const key = `${entrada.categoria}|${entrada.valor}`
    const base = mapa.get(key)
    mapa.set(key, {
      ...(base || { id: null, base: false }),
      ...entrada,
      key,
      base: Boolean(base)
    })
  }
  return Array.from(mapa.values()).sort(
    (a, b) => a.categoria.localeCompare(b.categoria) || a.valor.localeCompare(b.valor)
  )
})

/** Palabras activas por valor, para avisar cuando viven en varias familias. */
const categoriasPorValor = computed(() => {
  const mapa = new Map()
  for (const fila of filas.value) {
    if (fila.activo === false) continue
    const lista = mapa.get(fila.valor) || []
    lista.push(fila.categoria)
    mapa.set(fila.valor, lista)
  }
  return mapa
})

function otrasCategorias(fila) {
  return (categoriasPorValor.value.get(fila.valor) || []).filter(c => c !== fila.categoria)
}

/** Léxico efectivo para la herramienta de prueba: base + entradas remotas. */
const lexicoEfectivo = computed(() => {
  try {
    return crearLexico(LEXICO_BASE, entradasRemotas.value)
  } catch {
    return LEXICO_BASE
  }
})

function probar() {
  try {
    const entrada = {
      categoria: prueba.value.categoria,
      valor: prueba.value.valor.trim(),
      activo: prueba.value.activo !== false
    }
    const plantillas = prueba.value.plantillas.split('\n').map(x => x.trim()).filter(Boolean)
    resultadoPrueba.value = evaluarCambio(lexicoEfectivo.value, entrada, {
      frasesDoradas: FRASES_DORADAS,
      plantillas
    })
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error al probar.', color: 'error' })
  }
}

/** Etiquetas legibles de los campos que se movieron entre dos lecturas. */
const ETIQUETAS_CAMPO = {
  comando: 'comando',
  cantidad: 'cantidad',
  producto: 'producto',
  cliente: 'cliente',
  ubicacion: 'ubicación'
}

/** Por qué una prueba sin cambios no muestra nada. */
const MOTIVOS_PRUEBA = {
  sin_entrada: 'Escribe una palabra para probar.',
  formato: 'La palabra solo admite minúsculas sin tildes (2 a 24 letras).',
  palabra_reservada: 'Esa palabra está reservada para el intérprete (números, artículos, ubicaciones…).',
  conflicto_categoria: 'Esa palabra nueva ya vive en otro flujo: retírala allí o elige otra.',
  ya_existe: 'La palabra ya está activa en esa categoría: probarla no cambia nada.',
  no_esta_activa: 'La palabra no está activa en esa categoría: no hay nada que retirar.',
  sin_plantillas: 'Escribe al menos una plantilla con la palabra para ver qué cambia.',
  ninguna_plantilla_la_usa: 'Ninguna plantilla contiene esa palabra: añádela para que la prueba mida algo.'
}

function motivoPrueba(motivo) {
  return MOTIVOS_PRUEBA[motivo] || motivo
}

const ETIQUETAS_CATEGORIA = {
  venta_fuerte: 'Venta (fuerte)',
  venta_debil: 'Venta (débil)',
  fiado_verbo: 'Fiado (verbo)',
  fiado_venta_verbo: 'Fiado (verbo de venta)',
  cobro_verbo: 'Cobro (verbo)',
  cobro_marca: 'Cobro (marca)',
  consulta_marca: 'Consulta de stock',
  precio_marca: 'Consulta de precio',
  deuda_marca: 'Consulta de deuda',
  entrada_verbo: 'Entrada al almacén',
  precio_verbo: 'Cambio de precio',
  traspaso_verbo: 'Traspaso',
  transferencia_verbo: 'Transferencia al cuadre',
  merma_verbo: 'Merma',
  devolucion_verbo: 'Devolución al almacén',
  alta_verbo: 'Altas (producto/cliente)',
  mover_verbo: 'Mover producto',
  cuadre_abrir: 'Cuadre (abrir)',
  cuadre_cerrar: 'Cuadre (cerrar)'
}

const categorias = CATEGORIAS_LEXICO.map(value => ({
  label: ETIQUETAS_CATEGORIA[value] || value,
  value
}))

const columnas = [
  { accessorKey: 'categoria', header: 'Categoría' },
  { accessorKey: 'valor', header: 'Valor' },
  { accessorKey: 'origen', header: 'Origen' },
  { accessorKey: 'activo', header: 'Activo' },
  { accessorKey: 'version', header: 'Versión' },
  { accessorKey: 'acciones', header: '' }
]

async function cargar() {
  cargando.value = true
  try {
    entradasRemotas.value = await api.listarLexicoVoz() ?? []
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

/**
 * Base activa → crea un tombstone. Entrada remota → invierte su estado.
 * Una base desactivada se restaura borrando su tombstone.
 */
async function alternar(fila) {
  try {
    if (fila.id) {
      await api.actualizarEntradaLexicoVoz(fila.id, { activo: !fila.activo })
    } else if (fila.base && fila.activo) {
      await api.crearEntradaLexicoVoz({
        categoria: fila.categoria,
        valor: fila.valor,
        activo: false,
        nota: 'desactivada por el super admin'
      })
    }
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  }
}

/** Restaura una palabra base desactivada: su tombstone vuelve a estar activo. */
async function restaurar(fila) {
  if (!fila.id) return
  try {
    await api.actualizarEntradaLexicoVoz(fila.id, { activo: true })
    await cargar()
    toast.add({ title: 'Voz', description: 'Palabra base restaurada.', color: 'success' })
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
    description="Palabras base y sinónimos por flujo. Desactivar una palabra la retira de ese flujo; si vive en varios, desactívala en cada uno."
    leading-icon="i-lucide-book"
    :show-button="false"
  >
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
      empty-state="Sin entradas."
      @reload="cargar"
    >
      <template #categoria-cell="{ row }">
        <span class="text-xs">{{ ETIQUETAS_CATEGORIA[row.original.categoria] || row.original.categoria }}</span>
      </template>

      <template #valor-cell="{ row }">
        <span class="font-mono text-xs">{{ row.original.valor }}</span>
        <span v-if="otrasCategorias(row.original).length" class="mt-0.5 block text-[10px] text-muted">
          también en: {{ otrasCategorias(row.original).join(', ') }}
        </span>
      </template>

      <template #origen-cell="{ row }">
        <UBadge
          :color="row.original.base ? 'neutral' : 'primary'"
          variant="soft"
          size="sm"
          :label="row.original.base ? 'Base' : 'Personalizada'"
        />
      </template>

      <template #activo-cell="{ row }">
        <UBadge
          :color="row.original.activo ? 'success' : 'neutral'"
          variant="soft"
          size="sm"
          :label="row.original.activo ? 'Sí' : 'No'"
        />
      </template>

      <template #version-cell="{ row }">
        <span class="text-xs text-muted">{{ row.original.version ?? '—' }}</span>
      </template>

      <template #acciones-cell="{ row }">
        <div class="flex flex-wrap justify-end gap-1">
          <UButton size="xs" variant="outline" @click="alternar(row.original)">
            {{ row.original.activo ? 'Desactivar' : 'Activar' }}
          </UButton>
          <UButton
            v-if="row.original.id && row.original.base && !row.original.activo"
            size="xs"
            color="neutral"
            variant="soft"
            label="Restaurar"
            @click="restaurar(row.original)"
          />
        </div>
      </template>
    </BaseTable>

    <div class="mt-6 space-y-2 border rounded p-4">
      <h2 class="font-semibold">
        Probar entrada
      </h2>
      <div class="flex flex-col gap-2 md:flex-row md:items-end">
        <USelect v-model="prueba.categoria" :items="categorias" class="w-56" />
        <UInput v-model="prueba.valor" placeholder="palabra" class="w-48" />
        <USwitch
          v-model="prueba.activo"
          :label="prueba.activo ? 'Añadir' : 'Retirar'"
        />
        <UTextarea
          v-model="prueba.plantillas"
          placeholder="plantillas (una por línea). Ej.: liquida <n> <producto> a <cliente>"
          class="w-64"
        />
        <UButton @click="probar">
          Probar
        </UButton>
      </div>
      <div v-if="resultadoPrueba" class="space-y-1 text-sm">
        <p class="text-xs text-muted">
          Simula {{ prueba.activo ? 'añadir' : 'retirar' }} «{{ prueba.valor }}» en
          {{ ETIQUETAS_CATEGORIA[prueba.categoria] || prueba.categoria }} sobre
          {{ FRASES_DORADAS.length }} frases de referencia.
        </p>
        <UAlert
          v-if="resultadoPrueba.motivo"
          color="info"
          variant="soft"
          icon="i-lucide-info"
          :title="motivoPrueba(resultadoPrueba.motivo)"
        />
        <p>Regresiones: {{ resultadoPrueba.regresiones.length }}</p>
        <ul v-if="resultadoPrueba.regresiones.length">
          <li
            v-for="(r, i) in resultadoPrueba.regresiones"
            :key="`r-${i}`"
            class="text-error text-xs"
          >
            {{ r.frase }}: {{ r.antes }} → {{ r.despues }}
            <span v-if="r.campos.length" class="text-muted">
              ({{ r.campos.map(c => ETIQUETAS_CAMPO[c] || c).join(', ') }})
            </span>
          </li>
        </ul>
        <p>Cambios en plantillas: {{ resultadoPrueba.cambios.length }}</p>
        <ul v-if="resultadoPrueba.cambios.length">
          <li
            v-for="(c, i) in resultadoPrueba.cambios"
            :key="`c-${i}`"
            class="text-primary text-xs"
          >
            {{ c.plantilla }}: {{ c.antes }} → {{ c.despues }}
            <span v-if="c.campos.length" class="text-muted">
              ({{ c.campos.map(x => ETIQUETAS_CAMPO[x] || x).join(', ') }})
            </span>
          </li>
        </ul>
      </div>
    </div>

    <div class="mt-8 border-t pt-4">
      <h2 class="text-sm font-semibold">
        Alias aprendidos que sobran
      </h2>
      <p class="text-muted mt-1 text-xs">
        Un alias que el catálogo ya resuelve (el nombre del producto, o su nombre
        con la descripción) no aporta nada. Se muestran antes de borrar: no se
        borra nada solo.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-search"
          color="neutral"
          variant="soft"
          :loading="revisandoAlias"
          @click="revisarAlias"
        >
          Buscar los que sobran
        </UButton>
        <UButton
          v-if="aliasSobrantes.length"
          icon="i-lucide-trash-2"
          color="error"
          :loading="borrandoAlias"
          @click="borrarAliasSobrantes"
        >
          Borrar los que sobran ({{ aliasSobrantes.length }})
        </UButton>
      </div>

      <div v-if="aliasSobrantes.length" class="mt-3">
        <p class="text-xs">
          Se van a borrar:
        </p>
        <ul class="mt-1 list-inside list-disc text-xs">
          <li v-for="fila in aliasSobrantes" :key="fila.id">
            <span class="font-mono">{{ fila.texto }}</span>
            <span v-if="nombrePorProducto.get(fila.productoId)" class="text-muted">
              → {{ nombrePorProducto.get(fila.productoId) }}
            </span>
          </li>
        </ul>
      </div>
      <p v-else-if="revisadoAlias" class="text-muted mt-3 text-xs">
        No hay alias que sobren.
      </p>
    </div>
  </BaseHeaderPage>
</template>
