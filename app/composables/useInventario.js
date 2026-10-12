/**
 * useInventario — Capa de dominio del inventario (jefe).
 *
 * Online → endpoints transaccionales del servidor.
 * Local → mismos constructores shared + repos locales en db.transaction.
 * Ambas vías aplican idénticas reglas (ver shared/inventario/operaciones.js).
 */
import { TABLES } from '../../shared/tables'
import { useDb } from '../server-offline/db/client'
import { entradaAlmacenSchema } from '../../shared/schemas/entradaAlmacen'
import { traspasoSchema, ajusteInventarioSchema } from '../../shared/schemas/traspaso'
import { ventaDirectaSchema } from '../../shared/schemas/directas'
import {
  construirEntrada,
  construirTraspaso,
  construirAjuste,
  construirVentaDirecta,
  construirCorreccionLote,
  generarId,
  lotesConSaldo
} from '../../shared/inventario/operaciones'
import { vistaSaldos } from '../../shared/inventario/vista'
import { sugerenciaReposicion } from '../../shared/inventario/fifo'
import { $api } from '../utils/api'

const proveedoresConfig = TABLES.proveedores
const lotesConfig = TABLES.lotes
const traspasosConfig = TABLES.traspasos
const movimientosConfig = TABLES.movimientos_inventario
const productosConfig = TABLES.productos
const usuariosConfig = TABLES.usuarios
const ventasDirectasConfig = TABLES.ventas_directas
const ventasDirectasItemsConfig = TABLES.ventas_directas_items

export function useInventario() {
  const toast = useToast()
  const conexion = useModoConexion()
  const esOnline = computed(() => conexion.modo.value === 'online')
  const auth = useAuth()
  const db = useDb()

  function apiHeaders() {
    const token = auth.jwtSync.value
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const proveedoresRepo = computed(() => esOnline.value ? useRemoteRepo(proveedoresConfig) : useLocalRepo(proveedoresConfig))
  const lotesRepo = computed(() => esOnline.value ? useRemoteRepo(lotesConfig) : useLocalRepo(lotesConfig))
  const traspasosRepo = computed(() => esOnline.value ? useRemoteRepo(traspasosConfig) : useLocalRepo(traspasosConfig))
  const movimientosRepo = computed(() => esOnline.value ? useRemoteRepo(movimientosConfig) : useLocalRepo(movimientosConfig))
  const productosRepo = computed(() => esOnline.value ? useRemoteRepo(productosConfig) : useLocalRepo(productosConfig))
  const usuariosRepo = computed(() => esOnline.value ? useRemoteRepo(usuariosConfig) : useLocalRepo(usuariosConfig))
  const ventasDirectasRepo = computed(() => esOnline.value ? useRemoteRepo(ventasDirectasConfig) : useLocalRepo(ventasDirectasConfig))
  const ventasDirectasItemsRepo = computed(() => esOnline.value ? useRemoteRepo(ventasDirectasItemsConfig) : useLocalRepo(ventasDirectasItemsConfig))

  function r(repo) {
    return repo.value
  }

  function exigirJefe() {
    if (!auth.esJefe.value) throw new Error('Solo el jefe puede mover inventario.')
  }

  const cargando = ref(false)
  const saldos = ref([])
  const proveedores = ref([])
  const lotes = ref([])

  function puestoIdActual() {
    return auth.usuarioActual.value?.puestoId ?? null
  }

  async function cargarProveedores() {
    const todos = await r(proveedoresRepo).readAll()
    const pid = puestoIdActual()
    proveedores.value = todos
      .filter(p => !pid || p.puestoId === pid)
      .sort((a, b) => String(a.nombre ?? '').localeCompare(String(b.nombre ?? '')))
    return proveedores.value
  }

  async function cargarLotes(productoId = null) {
    const todos = await r(lotesRepo).readAll(productoId ? { query: { productoId } } : undefined)
    const pid = puestoIdActual()
    lotes.value = todos.filter(l => !pid || l.puestoId === pid)
    return lotes.value
  }

  async function cargarSaldos() {
    if (esOnline.value) {
      saldos.value = await $api('/api/inventario/saldos', { headers: apiHeaders() })
      return saldos.value
    }
    const pid = puestoIdActual()
    const [productos, lotesRows, movs] = await Promise.all([
      r(productosRepo).readAll(),
      r(lotesRepo).readAll(),
      r(movimientosRepo).readAll()
    ])
    const f = arr => arr.filter(x => !pid || x.puestoId === pid)
    saldos.value = vistaSaldos({ productos: f(productos), lotes: f(lotesRows), movimientos: f(movs) })
    return saldos.value
  }

  async function filasPuesto(repo, pid) {
    const todas = await r(repo).readAll()
    return todas.filter(x => !pid || x.puestoId === pid)
  }

  // ---------- Entradas ----------

  async function registrarEntrada(datos) {
    exigirJefe()
    const parsed = entradaAlmacenSchema.safeParse(datos)
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map(i => i.message).join('; '))
    }
    const pid = puestoIdActual()
    if (!pid) throw new Error('Sin puesto asignado.')
    cargando.value = true
    try {
      if (esOnline.value) {
        return await $api('/api/inventario/entradas', {
          method: 'POST',
          body: parsed.data,
          headers: apiHeaders()
        })
      }
      const usuarioId = auth.usuarioActual.value?.id ?? null
      const ahora = Date.now()
      const productos = await filasPuesto(productosRepo, pid)
      const porProd = new Map(productos.map(p => [p.id, p]))
      for (const l of parsed.data.lineas) {
        if (!porProd.has(l.productoId)) throw new Error('Hay productos que no pertenecen a este puesto.')
      }
      if (parsed.data.proveedorId) {
        const provs = await filasPuesto(proveedoresRepo, pid)
        if (!provs.some(p => p.id === parsed.data.proveedorId)) throw new Error('Proveedor inválido.')
      }
      const { entradaRef, lotes: lotesNuevos, movimientos } = construirEntrada(parsed.data, {
        puestoId: pid,
        usuarioId,
        ahora
      })
      await db.transaction(async () => {
        for (const l of lotesNuevos) await r(lotesRepo).create(l)
        for (const m of movimientos) await r(movimientosRepo).create(m)
      })
      await cargarSaldos().catch(() => {})
      return { entradaRef, lotes: lotesNuevos.length, movimientos: movimientos.length }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      throw err
    } finally {
      cargando.value = false
    }
  }

  // ---------- Traspasos ----------

  async function registrarTraspaso(datos) {
    exigirJefe()
    const parsed = traspasoSchema.safeParse(datos)
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map(i => i.message).join('; '))
    }
    const pid = puestoIdActual()
    if (!pid) throw new Error('Sin puesto asignado.')
    cargando.value = true
    try {
      if (esOnline.value) {
        return await $api('/api/inventario/traspasos', {
          method: 'POST',
          body: parsed.data,
          headers: apiHeaders()
        })
      }
      const usuarioId = auth.usuarioActual.value?.id ?? null
      const ahora = Date.now()
      const [filasLotes, movs] = await Promise.all([
        filasPuesto(lotesRepo, pid),
        filasPuesto(movimientosRepo, pid)
      ])
      const ids = [...new Set(parsed.data.lineas.map(l => l.productoId))]
      const lotesPorProducto = new Map(ids.map(id => [id, lotesConSaldo(filasLotes, movs, id, 'almacen')]))
      const { traspaso, movimientos, faltantes } = construirTraspaso({
        lineas: parsed.data.lineas,
        lotesPorProducto,
        meta: { puestoId: pid, usuarioId, ahora, fecha: parsed.data.fecha, notas: parsed.data.notas }
      })
      if (faltantes.length > 0) {
        throw new Error('Stock insuficiente en el almacén para uno o más productos.')
      }
      await db.transaction(async () => {
        await r(traspasosRepo).create({
          id: traspaso.id,
          fecha: traspaso.fecha,
          notas: traspaso.notas,
          puestoId: pid,
          usuarioId
        })
        for (const m of movimientos) await r(movimientosRepo).create(m)
      })
      await cargarSaldos().catch(() => {})
      return { traspasoId: traspaso.id, movimientos: movimientos.length }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      throw err
    } finally {
      cargando.value = false
    }
  }

  // ---------- Ajustes (merma / devolución) ----------

  async function registrarAjuste(datos) {
    exigirJefe()
    const parsed = ajusteInventarioSchema.safeParse(datos)
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map(i => i.message).join('; '))
    }
    const pid = puestoIdActual()
    if (!pid) throw new Error('Sin puesto asignado.')
    cargando.value = true
    try {
      if (esOnline.value) {
        return await $api('/api/inventario/ajustes', {
          method: 'POST',
          body: parsed.data,
          headers: apiHeaders()
        })
      }
      const usuarioId = auth.usuarioActual.value?.id ?? null
      const ahora = Date.now()
      const ubicacion = parsed.data.tipo === 'devolucion' ? 'quiosco' : parsed.data.ubicacion
      const [filasLotes, movs] = await Promise.all([
        filasPuesto(lotesRepo, pid),
        filasPuesto(movimientosRepo, pid)
      ])
      const disponibles = lotesConSaldo(filasLotes, movs, parsed.data.productoId, ubicacion)
      const { movimientos, faltante } = construirAjuste({
        productoId: parsed.data.productoId,
        tipo: parsed.data.tipo,
        ubicacion,
        cantidad: parsed.data.cantidad,
        motivo: parsed.data.motivo,
        nota: parsed.data.nota ?? null,
        lotesOrdenados: disponibles,
        meta: { puestoId: pid, usuarioId, ahora }
      })
      if (faltante) throw new Error('Stock insuficiente para este ajuste.')
      await db.transaction(async () => {
        for (const m of movimientos) await r(movimientosRepo).create(m)
      })
      await cargarSaldos().catch(() => {})
      return { movimientos: movimientos.length }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      throw err
    } finally {
      cargando.value = false
    }
  }

  // ---------- Operaciones fuera de cuadre ----------

  /**
   * Venta directa: efectivo cobrado por el jefe fuera de un cuadre. El producto
   * sale del inventario por FIFO desde la ubicación elegida y la ganancia queda
   * congelada en el registro; ninguna gaveta se toca.
   */
  async function registrarVentaDirecta(datos) {
    exigirJefe()
    const parsed = ventaDirectaSchema.safeParse(datos)
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map(i => i.message).join('; '))
    }
    const pid = puestoIdActual()
    if (!pid) throw new Error('Sin puesto asignado.')
    cargando.value = true
    try {
      if (esOnline.value) {
        return await $api('/api/ventas-directas', {
          method: 'POST',
          body: parsed.data,
          headers: apiHeaders()
        })
      }
      const usuarioId = auth.usuarioActual.value?.id ?? null
      const ahora = Date.now()
      const [filasLotes, movs, prods] = await Promise.all([
        filasPuesto(lotesRepo, pid),
        filasPuesto(movimientosRepo, pid),
        filasPuesto(productosRepo, pid)
      ])
      const ids = [...new Set(parsed.data.lineas.map(l => l.productoId))]
      const porId = new Map(prods.map(p => [p.id, p]))
      for (const id of ids) {
        if (!porId.has(id)) throw new Error('Hay productos que no pertenecen a este puesto.')
      }
      const lotesPorProducto = new Map(
        ids.map(id => [id, lotesConSaldo(filasLotes, movs, id, parsed.data.ubicacion)])
      )
      const ventaId = generarId()
      const venta = construirVentaDirecta({
        lineas: parsed.data.lineas,
        lotesPorProducto,
        ubicacion: parsed.data.ubicacion,
        ventaId,
        meta: { puestoId: pid, usuarioId, ahora }
      })
      if (venta.faltantes.length > 0) {
        const nombres = venta.faltantes.map(f => porId.get(f.productoId)?.nombre ?? f.productoId).join(', ')
        throw new Error(`No hay stock suficiente en ${parsed.data.ubicacion} para: ${nombres}.`)
      }
      await db.transaction(async () => {
        await r(ventasDirectasRepo).create({
          id: ventaId,
          puestoId: pid,
          ubicacionVenta: parsed.data.ubicacion,
          montoTotal: venta.montoTotal,
          costoTotal: venta.costoTotal,
          ganancia: venta.ganancia,
          notas: parsed.data.notas ?? null,
          usuarioId,
          anulado: false
        })
        for (const it of venta.items) {
          await r(ventasDirectasItemsRepo).create({ ...it, ventaDirectaId: ventaId })
        }
        for (const m of venta.movimientos) await r(movimientosRepo).create(m)
      })
      await cargarSaldos().catch(() => {})
      return {
        id: ventaId,
        montoTotal: venta.montoTotal,
        costoTotal: venta.costoTotal,
        ganancia: venta.ganancia
      }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      throw err
    } finally {
      cargando.value = false
    }
  }

  /**
   * Ventas directas del puesto para la vista /venta-directa.
   *
   * Normaliza la forma de la fila para que sea la misma online y local, porque
   * las dos vías no devuelven lo mismo: el endpoint ya resuelve el alias
   * `ubicacion` y trae `nombreUsuario` por su join con usuarios, mientras que
   * el sqlite devuelve la columna cruda (`ubicacionVenta`, `usuarioId`). Y
   * ninguna de las dos trae el nombre ni la descripción del producto, que viven
   * en `productos` y en `ventas_directas_items`.
   *
   * La unión se hace una sola vez aquí y la tabla no tiene que saber de qué
   * modo salieron los datos.
   *
   * @returns {Promise<Array>} ventas del puesto, sin anular, de más reciente a
   *   más antigua, cada una con sus `lineas` ya ordenadas por secuencia y
   *   enriquecidas con nombre/descripción/unidad del producto.
   */
  async function cargarVentasDirectas({ desde, hasta } = {}) {
    const [ventas, items, prods, users] = await Promise.all([
      r(ventasDirectasRepo).readAll(),
      r(ventasDirectasItemsRepo).readAll(),
      r(productosRepo).readAll(),
      r(usuariosRepo).readAll()
    ])

    const pid = puestoIdActual()
    const desdeMs = desde ? new Date(desde).getTime() : null
    const hastaMs = hasta ? new Date(hasta).getTime() : null

    function enRango(v) {
      const t = new Date(v.creadoEn ?? 0).getTime()
      if (Number.isNaN(t)) return false
      if (desdeMs != null && t < desdeMs) return false
      if (hastaMs != null && t > hastaMs) return false
      return true
    }

    const cabecera = (ventas ?? []).filter(v =>
      (!pid || v.puestoId === pid) && !v.anulado && enRango(v)
    )
    const ids = new Set(cabecera.map(v => v.id))

    const productoPorId = new Map((prods ?? []).map(p => [p.id, p]))
    const usuarioPorId = new Map((users ?? []).map(u => [u.id, u]))

    // Las líneas no tienen puestoId (lo heredan de su venta), así que el
    // corte por puesto se hace contra los ids de las ventas ya filtradas.
    const lineasPorVenta = new Map()
    for (const it of items ?? []) {
      if (!ids.has(it.ventaDirectaId)) continue
      if (!lineasPorVenta.has(it.ventaDirectaId)) lineasPorVenta.set(it.ventaDirectaId, [])
      lineasPorVenta.get(it.ventaDirectaId).push(it)
    }

    return cabecera
      .map(v => ({
        ...v,
        ubicacion: v.ubicacion ?? v.ubicacionVenta ?? null,
        nombreUsuario: v.nombreUsuario ?? usuarioPorId.get(v.usuarioId)?.nombre ?? null,
        lineas: (lineasPorVenta.get(v.id) ?? [])
          .slice()
          .sort((a, b) => (Number(a.secuencia) || 0) - (Number(b.secuencia) || 0))
          .map((it) => {
            const p = productoPorId.get(it.productoId)
            return {
              ...it,
              nombreProducto: p?.nombre ?? 'Producto eliminado',
              descripcionProducto: p?.descripcion ?? null,
              unidad: p?.unidad ?? null
            }
          })
      }))
      .sort((a, b) => new Date(b.creadoEn ?? 0) - new Date(a.creadoEn ?? 0))
  }

  // ---------- Corrección de cantidad y precio de un lote ----------

  /**
   * Corrige una entrada ya registrada (cantidad, precio o los dos).
   *
   * Online delega en el endpoint; offline corre el MISMO constructor de
   * shared/inventario/operaciones.js sobre el sqlite, dentro de una
   * transacción. Las reglas no se duplican en ningún sitio.
   *
   * @param {string} loteId
   * @param {{ cantidadInicial?: number|null, precioUnitario?: number|null, motivo: string }} cambios
   */
  async function corregirLote(loteId, cambios) {
    exigirJefe()
    if (!cambios?.motivo?.trim()) throw new Error('El motivo es obligatorio.')
    cargando.value = true
    try {
      const datos = {
        cantidadInicial: cambios.cantidadInicial ?? null,
        precioUnitario: cambios.precioUnitario ?? null,
        motivo: cambios.motivo.trim()
      }
      if (datos.cantidadInicial == null && datos.precioUnitario == null) {
        throw new Error('Escribe la cantidad o el precio correctos.')
      }
      if (esOnline.value) {
        return await $api(`/api/lotes/${loteId}`, {
          method: 'PATCH',
          body: datos,
          headers: apiHeaders()
        })
      }
      const pid = puestoIdActual()
      const lote = await r(lotesRepo).read(loteId)
      if (!lote || (pid && lote.puestoId !== pid)) throw new Error('Lote no encontrado.')
      const movs = await filasPuesto(movimientosRepo, pid)
      const plan = construirCorreccionLote({ lote, movimientos: movs, datos })
      await db.transaction(async () => {
        // La marca de tiempo la pone enrichForUpdate: la fila nace pendiente de
        // subir y con la hora de ahora, que es lo que hace que el push la
        // ganarle al servidor en vez de revertirse.
        await r(lotesRepo).update(loteId, plan.cambiosLote)
        for (const m of plan.movimientosActualizados) {
          await r(movimientosRepo).update(m.id, m)
        }
      })
      await cargarSaldos().catch(() => {})
      return { ...lote, ...plan.cambiosLote, saldoAlmacen: plan.almacen, saldoQuiosco: plan.quiosco }
    } catch (err) {
      toast.add({ title: 'Error', description: err.data?.statusMessage || err.message, color: 'error' })
      throw err
    } finally {
      cargando.value = false
    }
  }

  function sugerenciaParaManana(productos, saldosRows) {
    const mapa = new Map(saldosRows.map(s => [s.productoId, { almacen: s.almacen, quiosco: s.quiosco }]))
    return sugerenciaReposicion({ productos, saldos: mapa })
  }

  async function cargarProductos() {
    const todos = await r(productosRepo).readAll()
    const pid = puestoIdActual()
    return todos
      .filter(p => p.activo && (!pid || p.puestoId === pid))
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
  }

  /** Todos los activos, marcando cuáles se venden en el quiosco y cuáles no. */
  async function cargarProductosConEstado() {
    const todos = await r(productosRepo).readAll()
    const pid = puestoIdActual()
    return todos
      .filter(p => p.activo && (!pid || p.puestoId === pid))
      .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
      .map(p => ({ ...p, seVende: p.activoQuiosco !== false }))
  }

  return {
    cargando,
    saldos,
    proveedores,
    lotes,
    proveedoresRepo,
    lotesRepo,
    traspasosRepo,
    movimientosRepo,
    productosRepo,
    usuariosRepo,
    cargarProveedores,
    cargarLotes,
    cargarSaldos,
    cargarProductos,
    cargarProductosConEstado,
    registrarEntrada,
    registrarTraspaso,
    registrarAjuste,
    registrarVentaDirecta,
    cargarVentasDirectas,
    corregirLote,
    sugerenciaParaManana
  }
}
