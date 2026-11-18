import { computed, ref } from 'vue'
import {
  MAX_ALIAS_POR_PRODUCTO,
  esAliasValido,
  textoParaAlias
} from '#shared/voz/alias'
import { useAuth } from './useAuth'
import { useLocalRepo } from './useLocalRepo'

/**
 * useVozAlias — alias de producto aprendidos en este teléfono y puesto.
 *
 * Se aprende solo cuando el jefe elige el producto a mano. El alias únicamente
 * mejora el emparejamiento: no sustituye la confirmación ni el stock.
 */

const CONFIG = { tabla: 'voz_alias' }
const lista = ref([])
let cargadoPara = null
let cargaEnCurso = null

function reemplazar(fila) {
  if (!fila?.id) return
  const idx = lista.value.findIndex(a => a.id === fila.id)
  if (idx === -1) lista.value = [...lista.value, fila]
  else lista.value = lista.value.map(a => (a.id === fila.id ? fila : a))
}

export function useVozAlias() {
  const auth = useAuth()
  const repo = useLocalRepo(CONFIG)
  const puestoId = computed(() => auth.usuarioActual.value?.puestoId ?? null)

  /** Lo que consume el emparejador: texto normalizado + producto. */
  const paraEmparejar = computed(() =>
    lista.value.map(a => ({ texto: a.texto, productoId: a.productoId }))
  )

  async function cargar({ forzar = false } = {}) {
    const pid = puestoId.value
    if (!pid) return []
    if (!forzar && cargadoPara === pid) return lista.value
    if (cargaEnCurso) return cargaEnCurso

    cargaEnCurso = (async () => {
      const filas = await repo.readAll().catch(() => [])
      lista.value = (filas ?? []).filter(a => a.puestoId === pid)
      cargadoPara = pid
      return lista.value
    })().finally(() => { cargaEnCurso = null })

    return cargaEnCurso
  }

  /**
   * Aprende el alias si es válido y no choca con otro producto.
   * Devuelve la fila creada, `{ repetido: true }` si ya existía igual, o null.
   */
  async function aprender({ texto, productoId, productoNombre = null, origen = 'candidato' }) {
    const pid = puestoId.value
    if (!pid || !productoId) return null
    await cargar()

    const limpio = textoParaAlias(texto)
    if (!esAliasValido(limpio, { nombresProductos: productoNombre ? [productoNombre] : [] })) return null

    const existente = lista.value.find(a => a.texto === limpio)
    if (existente) {
      // Ya apunta a otro producto: no se pisa (conflicto).
      return existente.productoId === productoId ? { ...existente, repetido: true } : null
    }

    // Tope por producto: se descarta el menos usado y, a igualdad, el más viejo.
    const delProducto = lista.value
      .filter(a => a.productoId === productoId)
      .sort((a, b) => (Number(a.aciertos) || 0) - (Number(b.aciertos) || 0)
        || (Number(a.creadoEn) || 0) - (Number(b.creadoEn) || 0))
    if (delProducto.length >= MAX_ALIAS_POR_PRODUCTO) {
      const sobrante = delProducto[0]
      if (sobrante) await deshacer(sobrante.id)
    }

    try {
      const fila = await repo.create({
        id: crypto.randomUUID(),
        puestoId: pid,
        productoId,
        texto: limpio,
        origen: origen === 'asignado' ? 'asignado' : 'candidato',
        aciertos: 0
      })
      reemplazar(fila ?? { id: '', puestoId: pid, productoId, texto: limpio })
      return fila
    } catch (e) {
      // `(puesto, texto)` es único: otro intento simultáneo no duplica.
      if (/unique|constraint/i.test(e?.message ?? '')) return null
      throw e
    }
  }

  async function deshacer(id) {
    if (!id) return false
    try {
      await repo.remove(id)
      lista.value = lista.value.filter(a => a.id !== id)
      return true
    } catch {
      return false
    }
  }

  /** Suma un acierto; se usa al resolver una venta con el alias (diagnóstico). */
  async function registrarAcierto(id) {
    const actual = lista.value.find(a => a.id === id)
    if (!actual) return
    const fila = await repo.update(id, { aciertos: (Number(actual.aciertos) || 0) + 1 }).catch(() => null)
    if (fila) reemplazar(fila)
  }

  function invalidar() {
    cargadoPara = null
    lista.value = []
  }

  return {
    lista,
    paraEmparejar,
    cargar,
    aprender,
    deshacer,
    registrarAcierto,
    invalidar
  }
}
