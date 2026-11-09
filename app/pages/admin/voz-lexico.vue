<script setup>
import { evaluarCambio } from '#shared/voz/evaluarCambio'
import { FRASES_DORADAS } from '#shared/voz/frasesDoradas'
import { LEXICO_BASE } from '#shared/voz/lexico'

definePageMeta({
  layout: 'admin',
  middleware: ['super-admin']
})

const toast = useToast()
const filas = ref([])
const cargando = ref(false)
const route = useRoute()
const nueva = ref({ categoria: 'venta_fuerte', valor: '', clave: null, nota: '' })
const prueba = ref({ categoria: 'navegacion_verbo', valor: '', clave: 'deudas', plantillas: '' })
const resultadoPrueba = ref(null)

function probar() {
  try {
    const entrada = { categoria: prueba.value.categoria, valor: prueba.value.valor, clave: prueba.value.clave || null, activo: true }
    const plantillas = prueba.value.plantillas.split('\n').map(x => x.trim()).filter(Boolean)
    resultadoPrueba.value = evaluarCambio(LEXICO_BASE, entrada, { frasesDoradas: FRASES_DORADAS, plantillas })
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error al probar.', color: 'error' })
  }
}

const categorias = [
  'venta_fuerte', 'venta_debil', 'navegacion_verbo', 'navegacion_complemento', 'consulta_marca', 'navegacion_destino'
]

async function cargar() {
  cargando.value = true
  try {
    filas.value = await $fetch('/api/admin/voz/lexico')
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  } finally {
    cargando.value = false
  }
}

async function crear() {
  if (!nueva.value.valor) return
  try {
    await $fetch('/api/admin/voz/lexico', { method: 'POST', body: { ...nueva.value } })
    nueva.value.valor = ''
    nueva.value.clave = null
    nueva.value.nota = ''
    await cargar()
    toast.add({ title: 'Voz', description: 'Entrada creada.', color: 'success' })
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.data?.statusMessage || e?.message || 'Error', color: 'error' })
  }
}

async function alternar(fila) {
  try {
    await $fetch(`/api/admin/voz/lexico/${fila.id}`, { method: 'PATCH', body: { activo: !fila.activo } })
    await cargar()
  } catch (e) {
    toast.add({ title: 'Voz', description: e?.message || 'Error', color: 'error' })
  }
}

onMounted(() => {
  if (route.query.valor) nueva.value.valor = String(route.query.valor)
  void cargar()
})
</script>

<template>
  <section class="p-4 md:p-6 space-y-4">
    <h1 class="text-xl font-semibold">
      Léxico de voz
    </h1>

    <div class="flex flex-col gap-2 md:flex-row md:items-end">
      <USelect v-model="nueva.categoria" :options="categorias" class="w-56" />
      <UInput v-model="nueva.valor" placeholder="palabra" class="w-48" />
      <UInput v-model="nueva.clave" placeholder="clave (solo destino)" class="w-48" />
      <UInput v-model="nueva.nota" placeholder="nota" class="w-48" />
      <UButton @click="crear">
        Añadir
      </UButton>
    </div>

    <table class="min-w-full text-sm">
      <thead>
        <tr class="text-left border-b">
          <th class="py-2 pr-4">
            Categoría
          </th>
          <th class="py-2 pr-4">
            Valor
          </th>
          <th class="py-2 pr-4">
            Clave
          </th>
          <th class="py-2 pr-4">
            Activo
          </th>
          <th class="py-2 pr-4">
            Versión
          </th>
          <th class="py-2 pr-4">
            Acciones
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="fila in filas" :key="fila.id" class="border-b">
          <td class="py-2 pr-4">
            {{ fila.categoria }}
          </td>
          <td class="py-2 pr-4 font-mono text-xs">
            {{ fila.valor }}
          </td>
          <td class="py-2 pr-4">
            {{ fila.clave || '—' }}
          </td>
          <td class="py-2 pr-4">
            {{ fila.activo ? 'Sí' : 'No' }}
          </td>
          <td class="py-2 pr-4">
            {{ fila.version }}
          </td>
          <td class="py-2 pr-4">
            <UButton size="xs" @click="alternar(fila)">
              {{ fila.activo ? 'Desactivar' : 'Activar' }}
            </UButton>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="!filas.length" class="py-4 text-sm opacity-60">
      Sin entradas.
    </div>

    <div class="mt-6 space-y-2 border rounded p-4">
      <h2 class="font-semibold">
        Probar entrada
      </h2>
      <div class="flex flex-col gap-2 md:flex-row md:items-end">
        <USelect v-model="prueba.categoria" :options="categorias" class="w-56" />
        <UInput v-model="prueba.valor" placeholder="palabra" class="w-48" />
        <UInput v-model="prueba.clave" placeholder="clave" class="w-48" />
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
  </section>
</template>
